/**
 * ArticleReader Agent
 * Reads articles from URLs and provides both text and voice output.
 * Uses Mozilla Readability to extract clean article content.
 * 
 * Accepts text chunks containing URLs, parses them to clean text,
 * emits the text chunk, then generates voice audio for the article.
 * 
 * Runtime config (send null chunk with 'config.type: 'runtime'', or pass in session creation):
 * {
 *   "config.voice": {
 *     "backend": "voicebox",
 *     "profile": "ArticleReader",
 *     "voicebox": { "engine": "qwen" }
 *   }
 * }
 */

import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { annotateChunk, createTextChunk } from '../lib/chunk.js';
import { EMPTY, filter, map, mergeMap, catchError } from '../lib/stream.js';
import { parseArticle } from '../evaluators/readability.js';
import { detectLanguage } from '../evaluators/language-detection.js';
import { translateToEnglish } from '../evaluators/translation.js';
import { generateVoicePlain } from '../evaluators/voice-plain.js';

const ARTICLEREADER_SYSTEM_PROMPT = `You are ArticleReader, a helpful agent that reads articles aloud. You take URLs, extract clean article content, and provide both text and voice versions for easy consumption.`;

export const articleReaderAgent: AgentDefinition = {
  name: 'article-reader',
  description: 'Reads articles from URLs, extracts clean text, translates non-English content to English, and generates voice audio. Accepts URLs in text chunks.',
  configSchema: {
    type: 'object',
    properties: {
      backend: { type: 'string', description: 'LLM backend (kobold, ollama, or llamacpp)', default: 'ollama' },
      model: { type: 'string', description: 'Model name' },
      systemPrompt: { type: 'string', description: 'System prompt (overrides default ArticleReader prompt)', default: ARTICLEREADER_SYSTEM_PROMPT },
      llmParams: {
        type: 'object',
        properties: {
          temperature: { type: 'number', default: 0.7 },
          maxTokens: { type: 'number', default: 500 },
          topP: { type: 'number', default: 0.9 },
          topK: { type: 'number', default: 40 },
          repeatPenalty: { type: 'number', default: 1.1 },
          stop: { type: 'array', items: { type: 'string' }, default: ['\nUser:', 'Assistant:'] },
          seed: { type: 'number' },
          maxContextLength: { type: 'number' },
          numCtx: { type: 'number' },
        },
        default: {
          temperature: 0.7,
          maxTokens: 500,
          topP: 0.9,
          topK: 40,
          repeatPenalty: 1.1
        }
      },
      voice: {
        type: 'object',
        description: 'Voice TTS configuration',
        properties: {
          backend: { type: 'string', enum: ['coqui', 'voicebox'], default: 'voicebox' },
          profile: { type: 'string', description: 'Voicebox profile name', default: 'ArticleReader' },
          ttsEndpoint: { type: 'string', description: 'TTS endpoint URL' },
          voicebox: {
            type: 'object',
            properties: {
              engine: { type: 'string', enum: ['qwen', 'luxtts', 'chatterbox', 'chatterbox_turbo'], default: 'qwen' },
              normalize: { type: 'boolean', default: true },
              maxChunkChars: { type: 'number', default: 800 },
              crossfadeMs: { type: 'number', default: 50 }
            }
          }
        },
        default: {
          backend: 'voicebox',
          profile: 'ArticleReader',
          voicebox: { engine: 'qwen' }
        }
      }
    },
    default: {
      backend: 'ollama',
      systemPrompt: ARTICLEREADER_SYSTEM_PROMPT,
      llmParams: {
        temperature: 0.7,
        maxTokens: 500,
        topP: 0.9,
        topK: 40,
        repeatPenalty: 1.1
      },
      voice: {
        backend: 'voicebox',
        profile: 'ArticleReader',
        voicebox: { engine: 'qwen' }
      }
    },
    required: ['backend', 'model']
  },

  initialize(session: AgentSessionContext) {
    const sub = session.inputStream.pipe(
      // Accept text chunks (URLs)
      filter((chunk: Chunk) => chunk.contentType === 'text'),

      // Annotate with user role if not present
      map((chunk: Chunk) => {
        if (chunk.annotations['chat.role']) return chunk;
        return annotateChunk(chunk, 'chat.role', 'user');
      }),

      // Trust filtering
      filter((chunk: Chunk) => {
        const trustLevel = chunk.annotations['security.trust-level'];
        return !trustLevel || trustLevel.trusted !== false;
      }),

      // Parse article using readability
      mergeMap(parseArticle(session)),

      // Extract the parsed text and create a new text chunk for output
      mergeMap((chunk: Chunk) => {
        const readabilityResult = chunk.annotations['com.rxcafe.readability-parser'];
        if (!readabilityResult) return [chunk];

        // Create text chunk with the article text
        const articleTextChunk = createTextChunk(readabilityResult.text, 'assistant', {
          'chat.role': 'assistant',
          'article.source-url': chunk.content,
          'article.paragraphs': readabilityResult.paragraphs.length
        });

        // Emit the text chunk first
        session.outputStream.next(articleTextChunk);

        return [articleTextChunk];
      }),

      // Detect language
      mergeMap(detectLanguage(session)),

      // Translate to English if needed
      mergeMap(translateToEnglish(session)),

      // Annotate with voice config for TTS
      map((chunk: Chunk) => {
        return annotateChunk(chunk, 'voice.config', session.runtimeConfig.voice);
      }),

      // Generate voice output
      generateVoicePlain(session),

      catchError((error: Error) => {
        session.errorStream.next(error);
        return EMPTY;
      })
    ).subscribe({
      next: (chunk: Chunk) => session.outputStream.next(chunk),
      error: (error: Error) => session.errorStream.next(error)
    });

    session.pipelineSubscription = sub;
  }
};

export default articleReaderAgent;