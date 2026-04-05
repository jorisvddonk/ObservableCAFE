import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createTextChunk, createNullChunk } from '../lib/chunk.js';
import { filter } from '../lib/stream.js';
import { summarizeRss } from '../evaluators/rss-processor.js';

/**
 * RSS Summarizer Agent
 * Fetches RSS feeds daily at 07:00 and summarizes them using an LLM.
 * Responds to commands for manual control.
 */
export const rssSummarizerAgent: AgentDefinition = {
  name: 'rss-summarizer',
  description: 'Daily RSS feed summarizer (runs at 07:00)',
  startInBackground: true,
  configSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  
  async initialize(session: AgentSessionContext) {
    console.log(`[RssAgent] Initializing for session ${session.id}`);
    
    const getFeeds = (): string[] => {
      for (let i = session.history.length - 1; i >= 0; i--) {
        const chunk = session.history[i];
        if (chunk.contentType === 'null' && Array.isArray(chunk.annotations['rss.feeds'])) {
          return chunk.annotations['rss.feeds'];
        }
      }
      return [];
    };

    const saveFeeds = (feeds: string[]) => {
      const configChunk = createNullChunk('com.rxcafe.rss-agent', { 'rss.feeds': feeds });
      session.outputStream.next(configChunk);
    };

    const runSummarization = summarizeRss(session);

    const performBriefing = async (trigger: string) => {
      const feeds = getFeeds();
      if (feeds.length === 0) {
        session.outputStream.next(createTextChunk(
          `No RSS feeds configured. Use \`!addfeed <url>\` to add feeds.`,
          'com.rxcafe.rss-agent',
          { 'chat.role': 'assistant' }
        ));
        return;
      }

      console.log(`[RssAgent] Starting briefing triggered by: ${trigger}`);
      session.outputStream.next(createTextChunk(
        `🗞️ Starting daily briefing for ${new Date().toLocaleDateString()}...`,
        'com.rxcafe.rss-agent',
        { 'chat.role': 'assistant' }
      ));

      for (const url of feeds) {
        const summary = await runSummarization(url);
        session.outputStream.next(createTextChunk(
          `### Summary for ${url}\n\n${summary}`,
          'com.rxcafe.rss-agent',
          { 
            'chat.role': 'assistant', 
            'rss.source': url,
            'parsers.markdown.enabled': true
          }
        ));
      }
    };

    // 1. Schedule daily task (07:00)
    session.schedule('0 7 * * *', () => performBriefing('scheduled-task'));

    // 2. Handle interactive commands
    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text' && chunk.annotations['chat.role'] === 'user')
    ).subscribe(async chunk => {
      const text = (chunk.content as string).trim();
      
      try {
        if (text === '!help') {
          session.outputStream.next(createTextChunk(
            `Available commands:\n- \`!addfeed <url>\`: Add an RSS feed to summarize\n- \`!delfeed <url>\`: Remove an RSS feed\n- \`!feeds\`: List tracked RSS feeds\n- \`!refresh\`: Trigger summarization now\n- \`!help\`: Show this message`,
            'com.rxcafe.rss-agent',
            { 'chat.role': 'assistant' }
          ));
        }
        else if (text.startsWith('!addfeed ')) {
          const url = text.slice('!addfeed '.length).trim();
          if (!url) {
            session.outputStream.next(createTextChunk(
              `Usage: \`!addfeed <url>\``,
              'com.rxcafe.rss-agent',
              { 'chat.role': 'assistant' }
            ));
            return;
          }
          const feeds = [...getFeeds()];
          if (feeds.includes(url)) {
            session.outputStream.next(createTextChunk(
              `Feed already exists: ${url}`,
              'com.rxcafe.rss-agent',
              { 'chat.role': 'assistant' }
            ));
            return;
          }
          feeds.push(url);
          saveFeeds(feeds);
          session.outputStream.next(createTextChunk(
            `Added feed: ${url}`,
            'com.rxcafe.rss-agent',
            { 'chat.role': 'assistant' }
          ));
        }
        else if (text.startsWith('!delfeed ')) {
          const url = text.slice('!delfeed '.length).trim();
          if (!url) {
            session.outputStream.next(createTextChunk(
              `Usage: \`!delfeed <url>\``,
              'com.rxcafe.rss-agent',
              { 'chat.role': 'assistant' }
            ));
            return;
          }
          const feeds = getFeeds().filter(f => f !== url);
          saveFeeds(feeds);
          session.outputStream.next(createTextChunk(
            `Removed feed: ${url}`,
            'com.rxcafe.rss-agent',
            { 'chat.role': 'assistant' }
          ));
        }
        else if (text === '!feeds') {
          const feeds = getFeeds();
          if (feeds.length === 0) {
            session.outputStream.next(createTextChunk(
              `No feeds configured. Use \`!addfeed <url>\` to add feeds.`,
              'com.rxcafe.rss-agent',
              { 'chat.role': 'assistant' }
            ));
          } else {
            const list = feeds.map(f => `- ${f}`).join('\n');
            session.outputStream.next(createTextChunk(
              `Currently tracked feeds:\n${list}`,
              'com.rxcafe.rss-agent',
              { 'chat.role': 'assistant' }
            ));
          }
        }
        else if (text === '!refresh') {
          await performBriefing('manual-trigger');
        }
      } finally {
        if (session.callbacks?.onFinish) {
          session.callbacks.onFinish();
        }
      }
    });
    
    session.pipelineSubscription = sub;
  }
};

// ts-prune-ignore-next
export default rssSummarizerAgent;
