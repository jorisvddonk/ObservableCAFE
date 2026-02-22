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
  configSchema: [
    {
      key: 'backend',
      type: 'string',
      description: 'LLM backend to use (kobold or ollama)',
      required: false,
    },
    {
      key: 'model',
      type: 'string',
      description: 'Model name to use',
      required: false,
    },
    {
      key: 'systemPrompt',
      type: 'string',
      description: 'System prompt for the LLM',
      required: false,
    },
    {
      key: 'llmParams',
      type: 'object',
      description: 'LLM parameters (temperature, maxTokens, etc.)',
      required: false,
    },
  ],
  
  initialize(session: AgentSessionContext) {
    const evaluator = session.createEvaluator();
    
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
        return processWithEvaluator(chunk, evaluator, session);
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
