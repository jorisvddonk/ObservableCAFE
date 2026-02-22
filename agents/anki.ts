/**
 * Anki Agent
 * Study flashcards with spaced repetition.
 * 
 * Commands:
 * - /import <csv> - Import cards (format: front,back or front;back)
 * - /study - Start a study session
 * - /again - Rate current card as "Again"
 * - /hard - Rate current card as "Hard"  
 * - /good - Rate current card as "Good"
 * /easy - Rate current card as "Easy"
 * - /show - Show the answer again
 * - /stats - Show study statistics
 */

import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createTextChunk, createNullChunk, annotateChunk } from '../lib/chunk.js';
import { filter, map, mergeMap, catchError, take, EMPTY } from '../lib/stream.js';

interface AnkiCard {
  front: string;
  back: string;
  ease: number;
  interval: number;
  due: number;
  reviews: number;
}

interface AnkiState {
  cards: AnkiCard[];
  currentCardIndex: number;
  showingFront: boolean;
  sessionStart: number;
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

const ANKI_STATE_KEY = 'anki-state';

function createInitialState(): AnkiState {
  return {
    cards: [],
    currentCardIndex: -1,
    showingFront: true,
    sessionStart: 0,
    reviewed: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0
  };
}

function parseCSV(csv: string): AnkiCard[] {
  const cards: AnkiCard[] = [];
  const now = Date.now();
  const lines = csv.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    const parts = line.includes(';') ? line.split(';') : line.split(',');
    if (parts.length >= 2) {
      cards.push({
        front: parts[0].trim(),
        back: parts[1].trim(),
        ease: 2.5,
        interval: 0,
        due: now,
        reviews: 0
      });
    }
  }
  
  return cards;
}

function getDueCards(state: AnkiState): AnkiCard[] {
  const now = Date.now();
  return state.cards.filter(c => c.due <= now);
}

function scheduleCard(card: AnkiCard, rating: 'again' | 'hard' | 'good' | 'easy'): AnkiCard {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  let newEase = card.ease;
  let newInterval = card.interval;
  
  switch (rating) {
    case 'again':
      newInterval = 1;
      newEase = Math.max(1.3, card.ease - 0.2);
      break;
    case 'hard':
      newInterval = Math.max(1, Math.round(card.interval * 1.2));
      newEase = Math.max(1.3, card.ease - 0.15);
      break;
    case 'good':
      if (card.interval === 0) {
        newInterval = 1;
      } else if (card.interval === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(card.interval * card.ease);
      }
      break;
    case 'easy':
      if (card.interval === 0) {
        newInterval = 4;
      } else {
        newInterval = Math.round(card.interval * card.ease * 1.3);
      }
      newEase = card.ease + 0.15;
      break;
  }
  
  return {
    ...card,
    ease: newEase,
    interval: newInterval,
    due: now + newInterval * DAY_MS,
    reviews: card.reviews + 1
  };
}

function formatStats(state: AnkiState): string {
  const dueCount = getDueCards(state).length;
  const totalCards = state.cards.length;
  
  return `📊 Statistics

Total cards: ${totalCards}
Due now: ${dueCount}

Session:
- Reviewed: ${state.reviewed}
- Again: ${state.again}
- Hard: ${state.hard}
- Good: ${state.good}
- Easy: ${state.easy}`;
}

function showCard(state: AnkiState): Chunk | null {
  const dueCards = getDueCards(state);
  if (dueCards.length === 0) {
    return createTextChunk('🎉 No cards due! Great job!', 'anki-agent', { 'chat.role': 'assistant' });
  }
  
  const card = dueCards[0];
  state.currentCardIndex = state.cards.indexOf(card);
  state.showingFront = true;
  
  return createTextChunk(
    `📚 Card ${state.reviewed + 1} of session\n\n${card.front}\n\nType /show to reveal answer, /again /hard /good /easy to rate`,
    'anki-agent',
    { 'chat.role': 'assistant', 'anki.card-front': card.front, 'anki.card-back': card.back }
  );
}

function showAnswer(state: AnkiState): Chunk | null {
  const card = state.cards[state.currentCardIndex];
  if (!card) return createTextChunk('No card selected. Use /study first.', 'anki-agent', { 'chat.role': 'assistant' });
  
  state.showingFront = false;
  
  return createTextChunk(
    `${card.front}\n\n---\n\n${card.back}\n\nRate: /again /hard /good /easy`,
    'anki-agent',
    { 'chat.role': 'assistant', 'anki.card-front': card.front, 'anki.card-back': card.back }
  );
}

function rateCard(state: AnkiState, rating: 'again' | 'hard' | 'good' | 'easy'): Chunk {
  const card = state.cards[state.currentCardIndex];
  if (!card) {
    return createTextChunk('No card to rate. Use /study first.', 'anki-agent', { 'chat.role': 'assistant' });
  }
  
  const updatedCard = scheduleCard(card, rating);
  state.cards[state.currentCardIndex] = updatedCard;
  state.reviewed++;
  
  switch (rating) {
    case 'again': state.again++; break;
    case 'hard': state.hard++; break;
    case 'good': state.good++; break;
    case 'easy': state.easy++; break;
  }
  
  const dueCount = getDueCards(state).length;
  const nextInterval = updatedCard.interval;
  const intervalText = nextInterval === 0 ? 'now' : 
    nextInterval === 1 ? '1 day' : `${nextInterval} days`;
  
  return createTextChunk(
    `Rated: ${rating.toUpperCase()}\nNext review: ${intervalText}\n\n${dueCount > 0 ? `Cards remaining: ${dueCount}` : '🎉 All done!'}`,
    'anki-agent',
    { 'chat.role': 'assistant' }
  );
}

export const ankiAgent: AgentDefinition = {
  name: 'anki',
  description: 'Study flashcards with spaced repetition',
  configSchema: [],
  
  async initialize(session: AgentSessionContext) {
    let state = createInitialState();
    
    try {
      await session.loadState();
      const savedState = session.history.find(c => c.annotations['anki.saved-state']);
      if (savedState) {
        state = savedState.annotations['anki.saved-state'];
      }
    } catch {}
    
    session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text'),
      map((chunk: Chunk) => {
        if (chunk.annotations['chat.role']) return chunk;
        return annotateChunk(chunk, 'chat.role', 'user');
      }),
      filter((chunk: Chunk) => {
        const trustLevel = chunk.annotations['security.trust-level'];
        return !trustLevel || trustLevel.trusted !== false;
      }),
      mergeMap(async (chunk: Chunk) => {
        const text = chunk.content as string;
        
        if (text.startsWith('/import ')) {
          const csv = text.slice(8).trim();
          const newCards = parseCSV(csv);
          state.cards = [...state.cards, ...newCards];
          
          await session.persistState();
          
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          
          return createTextChunk(
            `✅ Imported ${newCards.length} cards. Total: ${state.cards.length}\n\nUse /study to start reviewing.`,
            'anki-agent',
            { 'chat.role': 'assistant' }
          );
        }
        
        if (text === '/stats') {
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return createTextChunk(formatStats(state), 'anki-agent', { 'chat.role': 'assistant' });
        }
        
        if (text === '/study') {
          state.sessionStart = Date.now();
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return showCard(state) || createTextChunk('No cards to study.', 'anki-agent', { 'chat.role': 'assistant' });
        }
        
        if (text === '/show') {
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return showAnswer(state) || createTextChunk('No card to show.', 'anki-agent', { 'chat.role': 'assistant' });
        }
        
        if (text === '/again') {
          const response = rateCard(state, 'again');
          await session.persistState();
          const nextCard = showCard(state);
          if (nextCard) {
            session.outputStream.next(response);
            if (session.callbacks?.onFinish) {
              session.callbacks.onFinish();
            }
            return nextCard;
          }
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return response;
        }
        
        if (text === '/hard') {
          const response = rateCard(state, 'hard');
          await session.persistState();
          const nextCard = showCard(state);
          if (nextCard) {
            session.outputStream.next(response);
            if (session.callbacks?.onFinish) {
              session.callbacks.onFinish();
            }
            return nextCard;
          }
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return response;
        }
        
        if (text === '/good') {
          const response = rateCard(state, 'good');
          await session.persistState();
          const nextCard = showCard(state);
          if (nextCard) {
            session.outputStream.next(response);
            if (session.callbacks?.onFinish) {
              session.callbacks.onFinish();
            }
            return nextCard;
          }
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return response;
        }
        
        if (text === '/easy') {
          const response = rateCard(state, 'easy');
          await session.persistState();
          const nextCard = showCard(state);
          if (nextCard) {
            session.outputStream.next(response);
            if (session.callbacks?.onFinish) {
              session.callbacks.onFinish();
            }
            return nextCard;
          }
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return response;
        }
        
        if (text.startsWith('/')) {
          if (session.callbacks?.onFinish) {
            session.callbacks.onFinish();
          }
          return createTextChunk(
            `Unknown command. Available:\n- /import <csv> - Import cards\n- /study - Start studying\n- /show - Show answer\n- /again /hard /good /easy - Rate card\n- /stats - View statistics`,
            'anki-agent',
            { 'chat.role': 'assistant' }
          );
        }
        
        const evaluator = session.createEvaluator();
        const chunks: Chunk[] = [];
        
        for await (const response of evaluator.evaluateChunk(chunk)) {
          chunks.push(response);
        }
        
        if (session.callbacks?.onFinish) {
          session.callbacks.onFinish();
        }
        
        return chunks[chunks.length - 1] || createNullChunk('anki-agent');
      }),
      catchError((error: Error) => {
        session.errorStream.next(error);
        return EMPTY;
      })
    ).subscribe({
      next: (chunk: Chunk) => session.outputStream.next(chunk),
      error: (error: Error) => session.errorStream.next(error)
    });
    
    session.pipelineSubscription?.unsubscribe();
  },
  
  async persistState() {
  }
};

export default ankiAgent;
