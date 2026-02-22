/**
 * Default Agent
 * Standard chat pipeline with modular utility usage.
 */

import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { annotateChunk } from '../lib/chunk.js';
import { EMPTY, filter, map, mergeMap, catchError } from '../lib/stream.js';
import { processWithEvaluator } from '../lib/evaluator-utils.js';

export const defaultAgent: AgentDefinition = {
  name: 'default',
  description: 'Standard chat pipeline with trust filtering',
  configSchema: {
    type: 'object',
    properties: {
      backend: { type: 'string', description: 'LLM backend (kobold or ollama)' },
      model: { type: 'string', description: 'Model name' },
      systemPrompt: { type: 'string', description: 'System prompt' },
      llmParams: {
        type: 'object',
        properties: {
          temperature: { type: 'number' },
          maxTokens: { type: 'number' },
          topP: { type: 'number' },
          topK: { type: 'number' },
          repeatPenalty: { type: 'number' },
          stop: { type: 'array', items: { type: 'string' } },
          seed: { type: 'number' },
          maxContextLength: { type: 'number' },
          numCtx: { type: 'number' },
        }
      }
    },
    required: ['backend', 'model']
  },
  
  initialize(session: AgentSessionContext) {
    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text'),
      
      map((chunk: Chunk) => {
        if (chunk.annotations['chat.role']) return chunk;
        return annotateChunk(chunk, 'chat.role', 'user');
      }),
      
      filter((chunk: Chunk) => {
        const trustLevel = chunk.annotations['security.trust-level'];
        return !trustLevel || trustLevel.trusted !== false;
      }),
      
      mergeMap((chunk: Chunk) => {
        if (chunk.annotations['chat.role'] !== 'user') return [chunk];
        // Create fresh evaluator per message to pick up runtime config changes
        return processWithEvaluator(chunk, session.createEvaluator(), session);
      }),
      
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

export default defaultAgent;
