import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { annotateChunk } from '../lib/chunk.js';
import { EMPTY, filter, mergeMap, catchError } from '../lib/stream.js';
import { analyzeSentiment } from '../evaluators/sentiment.js';
import { processWithEvaluator } from '../lib/evaluator-utils.js';

/**
 * ExampleFeaturesAgent
 * Demonstrates a high-level, modular RXCAFE pipeline.
 */
export const exampleFeaturesAgent: AgentDefinition = {
  name: 'example-features',
  description: 'Demonstrates modular evaluators with sentiment analysis',
  configSchema: {
    type: 'object',
    properties: {
      backend: { type: 'string', description: 'LLM backend (kobold or ollama)' },
      model: { type: 'string', description: 'Model name' },
    },
    required: ['backend', 'model']
  },
  
  initialize(session: AgentSessionContext) {
    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text' && chunk.annotations['chat.role'] === 'user'),
      
      // Step 1: Add sentiment metadata (encapsulated one-liner)
      mergeMap(analyzeSentiment(session)),
      
      // Step 2: Generate assistant response (fresh evaluator per message)
      mergeMap(chunk => processWithEvaluator(chunk, session.createEvaluator(), session)),
      
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

export default exampleFeaturesAgent;
