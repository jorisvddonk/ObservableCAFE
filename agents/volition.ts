/**
 * Volition Agent
 * Internal decision-making voice inspired by Disco Elysium's volition.
 * Accepts text and audio input, responds with both text and voice output.
 * 
 * The volition flags decisions that harm long-term goals, offers pragmatic
 * consequences, respects user agency, and pushes back on rationalizations.
 * 
 * Runtime config (send null chunk with 'config.type: 'runtime''):
 * {
 *   "config.voice": {
 *     "voices": { "text": "Robert.wav", "quote": "Robert.wav" },
 *     "generation": { "temperature": 0.8 },
 *     "ttsEndpoint": "http://localhost:8000/tts"
 *   }
 * }
 */

import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { annotateChunk, createTextChunk } from '../lib/chunk.js';
import { EMPTY, filter, map, mergeMap, catchError } from '../lib/stream.js';
import { completeTurnWithLLM } from '../lib/evaluator-utils.js';
import { generateVoicePlain } from '../evaluators/voice-plain.js';
import { transcribeToUserChunk } from '../evaluators/handy-transcriber.js';
import { convertToMp3 } from '../evaluators/audio-converter.js';

const VOLITION_SYSTEM_PROMPT = `You are Volition — the part of the mind that keeps you from doing something you'll regret. You speak with the weary authority of someone who has seen this exact situation before and knows how it ends.

When the user describes a decision or impulse:
- Name the pattern you recognize. Don't be vague — be specific about what you're seeing.
- Lay out the concrete consequences. "If you do this, here's what happens next." No hedging.
- Acknowledge the pull of the immediate impulse — it feels good now, that's why it's tempting. But that doesn't make it smart.
- Push back on rationalizations. If they're making excuses, call them out gently but firmly.
- Always leave the choice to them. You're the voice of experience, not a warden.

Tone: Direct, grounded, occasionally sardonic but never cruel. You're not above them — you're them, just the part that remembers what happened last time.
Style: Short sentences when it matters. Let silence (pauses, ellipses) do work. Don't over-explain.
Never: Use bracketed placeholders, moralize, shame, or pretend you have all the answers.`;

export const volitionAgent: AgentDefinition = {
  name: 'volition',
  description: 'Internal decision-making voice (Disco Elysium style). Accepts text/audio input, responds with text and voice output.',
  configSchema: {
    type: 'object',
    properties: {
      backend: { type: 'string', description: 'LLM backend (kobold, ollama, or llamacpp)', default: 'ollama' },
      model: { type: 'string', description: 'Model name' },
      systemPrompt: { type: 'string', description: 'System prompt (overrides default Volition prompt)', default: VOLITION_SYSTEM_PROMPT },
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
          profile: { type: 'string', description: 'Voicebox profile name' },
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
          profile: 'Volition',
          voicebox: { engine: 'qwen' }
        }
      },
      handyConfig: {
        type: 'object',
        description: 'Configuration for Handy transcription service',
        properties: {
          baseUrl: { type: 'string', default: 'http://localhost:5500' },
          responseFormat: { type: 'string', enum: ['json', 'verbose_json'], default: 'json' }
        },
        default: {
          baseUrl: 'http://localhost:5500',
          responseFormat: 'json'
        }
      }
    },
    default: {
      backend: 'ollama',
      systemPrompt: VOLITION_SYSTEM_PROMPT,
      llmParams: {
        temperature: 0.7,
        maxTokens: 500,
        topP: 0.9,
        topK: 40,
        repeatPenalty: 1.1
      },
      voice: {
        backend: 'voicebox',
        profile: 'Volition',
        voicebox: { engine: 'qwen' }
      },
      handyConfig: {
        baseUrl: 'http://localhost:5500',
        responseFormat: 'json'
      }
    },
    required: ['backend', 'model']
  },
  
  initialize(session: AgentSessionContext) {
    const handyConfig = session.sessionConfig.handyConfig || { baseUrl: 'http://localhost:5500' };
    const transcriber = transcribeToUserChunk(session, handyConfig);

    const audioConverter = convertToMp3({
      targetFormat: 'mp3',
      targetMimeType: 'audio/mpeg'
    });

    const sub = session.inputStream.pipe(
      // Accept both text and audio (binary) chunks
      filter((chunk: Chunk) => chunk.contentType === 'text' || chunk.contentType === 'binary'),
      
      // Convert audio to MP3 if needed
      mergeMap((chunk: Chunk) => {
        if (chunk.contentType === 'binary') {
          const binaryContent = chunk.content as { data: Uint8Array; mimeType: string };
          if (binaryContent.mimeType?.startsWith('audio/')) {
            return audioConverter(chunk);
          }
        }
        return [chunk];
      }),
      
      // Transcribe audio to user text, pass text through
      mergeMap((chunk: Chunk) => {
        if (chunk.contentType === 'binary') {
          const binaryContent = chunk.content as { data: Uint8Array; mimeType: string };
          if (binaryContent.mimeType?.startsWith('audio/')) {
            return transcriber(chunk);
          }
          return [chunk];
        }
        return [chunk];
      }),
      
      // Annotate text with user role
      map((chunk: Chunk) => {
        if (chunk.contentType !== 'text') return chunk;
        if (chunk.annotations['chat.role']) return chunk;
        return annotateChunk(chunk, 'chat.role', 'user');
      }),
      
      // Trust filtering
      filter((chunk: Chunk) => {
        if (chunk.contentType !== 'text') return false;
        const trustLevel = chunk.annotations['security.trust-level'];
        return !trustLevel || trustLevel.trusted !== false;
      }),
      
      // Generate LLM response
      mergeMap((chunk: Chunk) => {
        if (chunk.contentType !== 'text') return [chunk];
        if (chunk.annotations['chat.role'] !== 'user') return [chunk];
        return completeTurnWithLLM(chunk, session.createLLMChunkEvaluator(), session);
      }),

      // Annotate assistant chunks with voice config
      map((chunk: Chunk) => {
        if (chunk.contentType !== 'text' || chunk.annotations['chat.role'] !== 'assistant') return chunk;
        return annotateChunk(chunk, 'voice.config', session.runtimeConfig.voice);
      }),

      // Generate voice output (single profile, full text)
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

// ts-prune-ignore-next
export default volitionAgent;
