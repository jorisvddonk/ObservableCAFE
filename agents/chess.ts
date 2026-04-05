/**
 * Chess Agent
 * Play chess against the AI using chess.js for move validation
 * Supports both chat and game-chess UI modes.
 */

import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createTextChunk, createNullChunk, annotateChunk } from '../lib/chunk.js';
import { EMPTY, filter, map, mergeMap, catchError } from '../lib/stream.js';
import { Chess } from 'chess.js';

interface ChessStateData {
  fen: string;
  turn: 'w' | 'b';
  moveHistory: string[];
  gameOver: boolean;
  winner: 'white' | 'black' | 'draw' | null;
}

function formatBoard(fen: string): string {
  const chess = new Chess(fen);
  const board = chess.board();
  
  const PIECE_SYMBOLS: Record<string, string> = {
    'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
  };
  
  let result = '  ┌───┬───┬───┬───┬───┬───┬───┬───┐\n';
  
  for (let row = 0; row < 8; row++) {
    result += `${8 - row} │`;
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      const symbol = piece ? (PIECE_SYMBOLS[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] || piece.type) : ' ';
      result += ` ${symbol} │`;
    }
    result += '\n  ├───┼───┼───┼───┼───┼───┼───┼───┤\n';
  }
  
  result += '    a   b   c   d   e   f   g   h\n';
  
  const playerIndicator = chess.turn() === 'w' ? '♔ White' : '♚ Black';
  result += `\nCurrent player: ${playerIndicator}`;
  
  if (chess.isCheck()) {
    result += ' (CHECK!)';
  }
  
  return result;
}

function formatMoveHistory(history: string[]): string {
  if (history.length === 0) {
    return 'No moves yet.';
  }
  
  let result = '';
  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = history[i] || '';
    const blackMove = history[i + 1] || '';
    result += `${moveNum}. ${whiteMove} ${blackMove}\n`;
  }
  
  return result;
}

function getAIMove(chess: Chess): string | null {
  const moves = chess.moves({ verbose: true });
  
  if (moves.length === 0) return null;
  
  const pieceValues: Record<string, number> = {
    'p': 1, 'P': 1,
    'n': 3, 'N': 3,
    'b': 3, 'B': 3,
    'r': 5, 'R': 5,
    'q': 9, 'Q': 9,
    'k': 0, 'K': 0,
  };
  
  const scoredMoves = moves.map(move => {
    let score = Math.random() * 2;
    
    if (move.captured) {
      score += pieceValues[move.captured] || 0;
    }
    
    if (move.flags.includes('c') || move.flags.includes('e')) {
      score += 0.5;
    }
    
    if (move.flags.includes('k') || move.flags.includes('q')) {
      score += 0.3;
    }
    
    if (move.promotion) {
      score += 8;
    }
    
    const newChess = new Chess(chess.fen());
    newChess.move(move);
    if (newChess.isCheck()) {
      score += 5;
    }
    if (newChess.isCheckmate()) {
      score += 100;
    }
    
    return { move, score };
  });
  
  scoredMoves.sort((a, b) => b.score - a.score);
  
  const topMoves = scoredMoves.slice(0, 3);
  const selected = topMoves[Math.floor(Math.random() * topMoves.length)];
  
  return selected.move.san;
}

export const chessAgent: AgentDefinition = {
  name: 'chess',
  description: 'Play chess against the AI with move validation',
  configSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  supportedUIs: ['chat', 'game-chess'],
  
  initialize(session: AgentSessionContext) {
    let chess = new Chess();
    
    const loadState = async () => {
      for (const chunk of session.history) {
        if (chunk.contentType === 'null') {
          if (chunk.annotations['chess.fen']) {
            try {
              chess = new Chess(chunk.annotations['chess.fen'] as string);
            } catch (e) {
              chess = new Chess();
            }
          }
        }
      }
    };
    
    loadState();
    
    const getGameOverStatus = (): { gameOver: boolean; winner: 'white' | 'black' | 'draw' | null } => {
      if (chess.isCheckmate()) {
        return { gameOver: true, winner: chess.turn() === 'w' ? 'black' : 'white' };
      }
      if (chess.isDraw()) {
        return { gameOver: true, winner: 'draw' };
      }
      return { gameOver: false, winner: null };
    };
    
    const getChessAnnotations = (extra: Record<string, any> = {}): Record<string, any> => {
      const status = getGameOverStatus();
      return {
        'chess.fen': chess.fen(),
        'chess.turn': chess.turn(),
        'chess.isCheck': chess.isCheck(),
        'chess.gameOver': status.gameOver,
        'chess.winner': status.winner,
        'chess.moveHistory': chess.history(),
        ...extra,
      };
    };
    
    const getStateData = (): ChessStateData => {
      const status = getGameOverStatus();
      return {
        fen: chess.fen(),
        turn: chess.turn(),
        moveHistory: chess.history() as string[],
        gameOver: status.gameOver,
        winner: status.winner,
      };
    };
    
    const initialMessage = `♟️♟️♟️ **Chess** ♟️♟️♟️

You are playing White.

${formatBoard(chess.fen())}

Make your move in algebraic notation (e.g., e4, Nf3, Bxc5, O-O)`;
    
    session.outputStream.next(createTextChunk(
      initialMessage,
      'chess-agent',
      { 'chat.role': 'assistant', 'chess.start': true, ...getChessAnnotations() }
    ));
    
    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text'),
      
      map((chunk: Chunk) => {
        if (chunk.annotations['chat.role']) return chunk;
        return annotateChunk(chunk, 'chat.role', 'user');
      }),
      
      mergeMap(async (chunk: Chunk) => {
        const content = chunk.content?.toString() || '';
        const trimmed = content.trim().toLowerCase();
        let result: Chunk[] = [];
        
        if (trimmed === '!new' || trimmed === '!reset') {
          chess = new Chess();
          const msg = `♟️♟️♟️ **New Game** ♟️♟️♟️

You are playing White.

${formatBoard(chess.fen())}

Make your move in algebraic notation (e.g., e4, Nf3, Bxc5, O-O)`;
          
          result = [
            createTextChunk(msg, 'chess-agent', { 'chat.role': 'assistant', 'chess.newGame': true, ...getChessAnnotations() }),
          ];
        } else if (trimmed === '!board' || trimmed === '!position') {
          const msg = `${formatBoard(chess.fen())}\n\nMove history:\n${formatMoveHistory(chess.history() as string[])}`;
          result = [createTextChunk(msg, 'chess-agent', { 'chat.role': 'assistant', 'chess.board': true, ...getChessAnnotations() })];
        } else if (trimmed === '!moves' || trimmed === '!history') {
          result = [createTextChunk(formatMoveHistory(chess.history() as string[]), 'chess-agent', { 'chat.role': 'assistant', 'chess.history': true, ...getChessAnnotations() })];
        } else if (trimmed === '!help' || trimmed === '!commands') {
          const helpText = `♟️ **Chess Commands** ♟️

- !new - Start a new game
- !board - Show the current board
- !moves - Show move history
- !help - Show this help

To move, enter algebraic notation:
- Pawn: e4 (from e2 to e4)
- Knight: Nf3 or Ng1f3
- Bishop: Bxc5
- Rook: Rad1
- Queen: Qxd7+
- King: Kf1
- Castling: O-O (kingside) or O-O-0 (queenside)
- Promotion: e8=Q`;
          
          result = [createTextChunk(helpText, 'chess-agent', { 'chat.role': 'assistant', 'chess.help': true, ...getChessAnnotations() })];
        } else {
          const status = getGameOverStatus();
          
          if (status.gameOver) {
            const msg = `Game is over! ${status.winner === 'white' ? 'White wins!' : status.winner === 'black' ? 'Black wins!' : 'Draw!'} Type !new to start a new game.`;
            result = [createTextChunk(msg, 'chess-agent', { 'chat.role': 'assistant', 'chess.gameOver': true, ...getChessAnnotations() })];
          } else {
            const moveAttempt = content.trim();
            let moveResult;
            
            try {
              moveResult = chess.move(moveAttempt);
            } catch (e) {
              moveResult = null;
            }
            
            if (!moveResult) {
              const validMoves = chess.moves();
              const invalidMsg = `Invalid move: "${moveAttempt}". Try: ${validMoves.slice(0, 5).join(', ')}`;
              result = [
                createTextChunk(
                  `${invalidMsg}\n\nValid moves: ${validMoves.slice(0, 20).join(', ')}${validMoves.length > 20 ? '...' : ''}`,
                  'chess-agent',
                  { 'chat.role': 'assistant', 'chess.invalid': true, 'chess.invalidMove': invalidMsg, ...getChessAnnotations() }
                ),
              ];
            } else {
              const statusAfterPlayer = getGameOverStatus();
              
              if (statusAfterPlayer.gameOver) {
                const msg = `You played ${moveResult.san}.\n\n${formatBoard(chess.fen())}\n\nCheckmate! ${statusAfterPlayer.winner === 'white' ? 'White wins!' : statusAfterPlayer.winner === 'black' ? 'Black wins!' : 'Draw!'} Type !new to start a new game.`;
                result = [
                  createTextChunk(msg, 'chess-agent', { 'chat.role': 'assistant', 'chess.move': true, ...getChessAnnotations() }),
                ];
              } else {
                const aiMoveSan = getAIMove(chess);
                
                if (aiMoveSan) {
                  chess.move(aiMoveSan);
                  
                  const statusAfterAI = getGameOverStatus();
                  
                  if (statusAfterAI.gameOver) {
                    const msg = `You played ${moveResult.san}. I played ${aiMoveSan}.\n\n${formatBoard(chess.fen())}\n\nCheckmate! ${statusAfterAI.winner === 'white' ? 'White wins!' : statusAfterAI.winner === 'black' ? 'Black wins!' : 'Draw!'} Type !new to start a new game.`;
                    result = [
                      createTextChunk(msg, 'chess-agent', { 'chat.role': 'assistant', 'chess.move': true, ...getChessAnnotations() }),
                    ];
                  } else {
                    const msg = `You played ${moveResult.san}. I played ${aiMoveSan}.\n\n${formatBoard(chess.fen())}\n\nMake your move in algebraic notation (e.g., e4, Nf3)`;
                    result = [
                      createTextChunk(msg, 'chess-agent', { 'chat.role': 'assistant', 'chess.move': true, ...getChessAnnotations() }),
                    ];
                  }
                }
              }
            }
          }
        }
        
        if (session.callbacks?.onFinish) {
          session.callbacks.onFinish();
        }
        
        return result;
      }),
      
      catchError((error: Error) => {
        session.errorStream.next(error);
        return EMPTY;
      })
    ).subscribe({
      next: (chunks: Chunk | Chunk[]) => {
        if (Array.isArray(chunks)) {
          for (const chunk of chunks) {
            session.outputStream.next(chunk);
          }
        } else {
          session.outputStream.next(chunks);
        }
        if (session.callbacks?.onFinish) {
          session.callbacks.onFinish();
        }
      },
      error: (error: Error) => session.errorStream.next(error)
    });
    
    session.pipelineSubscription = sub;
  }
};

// ts-prune-ignore-next
export default chessAgent;
