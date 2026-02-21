import type { AgentDefinition, AgentSessionContext, AgentEvaluator } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createTextChunk, createNullChunk, annotateChunk } from '../lib/chunk.js';
import { EMPTY, Observable, filter, mergeMap, catchError } from '../lib/stream.js';
import { buildConversationContext } from '../core.js';

export const exampleFeaturesAgent: AgentDefinition = {
  name: 'example-features',
  description: 'Demonstrates custom sentiment analysis evaluators',
  
  initialize(session: AgentSessionContext) {
    const config = session.sessionConfig;
    const backend = config.backend || session.config.backend;
    const model = config.model;
    const llmParams = config.llmParams || {};
    
    const sentimentEvaluator = session.createEvaluator(backend, model, { 
      ...llmParams, 
      temperature: 0,
      maxTokens: 150 
    });

    const chatEvaluator = session.createEvaluator(backend, model, llmParams);
    
    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text' && chunk.annotations['chat.role'] === 'user'),
      
      mergeMap(async (chunk: Chunk) => {
        console.log(`[ExampleFeatures] Analyzing sentiment for: ${chunk.id}`);
        const sentiment = await analyzeSentiment(chunk, sentimentEvaluator);
        
        // idiomatic annotation update
        const annotated = annotateChunk(chunk, 'com.rxcafe.example.sentiment', sentiment);
        
        // Re-emit to standard output stream to update history and SSE
        session.outputStream.next(annotated);
        return annotated;
      }),
      
      mergeMap((chunk: Chunk) => processWithEvaluator(chunk, chatEvaluator, session)),
      
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

async function analyzeSentiment(chunk: Chunk, evaluator: AgentEvaluator): Promise<any> {
  const text = chunk.content as string;
  const prompt = `You are a sentiment analysis expert. Analyze the sentiment of the following text.

Text to analyze: "${text}"

Return your analysis in the following JSON format:
{
  "score": <number from -1.0 to 1.0, where -1 is very negative, 0 is neutral, 1 is very positive>,
  "explanation": "<brief explanation of the sentiment>"
}

Only return the JSON, no other text.`;

  const promptChunk = createTextChunk(prompt, 'com.rxcafe.sentiment-analyzer', { 
    'llm.full-prompt': true 
  });

  let rawJson = '';
  try {
    for await (const tokenChunk of evaluator.evaluateChunk(promptChunk)) {
      if (tokenChunk.contentType === 'text') rawJson += tokenChunk.content;
    }
    
    // Robust extraction: find the first { and last }
    const start = rawJson.indexOf('{');
    const end = rawJson.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const jsonStr = rawJson.substring(start, end + 1);
      return JSON.parse(jsonStr);
    }
  } catch (err) {
    console.error('[ExampleFeatures] Sentiment error:', err);
  }
  return { score: 0, explanation: 'Analysis failed' };
}

function processWithEvaluator(
  chunk: Chunk,
  evaluator: AgentEvaluator,
  session: AgentSessionContext
): Observable<Chunk> {
  return new Observable(subscriber => {
    const context = buildConversationContext(session.history, chunk.id, session.systemPrompt);
    const prompt = context
      ? `${context}

User: ${chunk.content}
Assistant:`
      : `User: ${chunk.content}
Assistant:`;
    
    subscriber.next(createNullChunk('com.rxcafe.llm', {
      'llm.generation-started': true,
      'llm.parent-chunk-id': chunk.id
    }));
    
    let fullResponse = '';
    (async () => {
      try {
        const contextChunk = createTextChunk(prompt, 'com.rxcafe.chat-evaluator');
        for await (const tokenChunk of evaluator.evaluateChunk(contextChunk)) {
          if (tokenChunk.contentType === 'text') {
            const token = tokenChunk.content as string;
            fullResponse += token;
            if (session.callbacks?.onToken) session.callbacks.onToken(token);
          }
        }
        subscriber.next(createTextChunk(fullResponse, 'com.rxcafe.assistant', { 'chat.role': 'assistant' }));
        if (session.callbacks?.onFinish) session.callbacks.onFinish();
        await session.persistState();
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    })();
  });
}

export default exampleFeaturesAgent;