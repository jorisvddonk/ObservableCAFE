/**
 * Language Detection Evaluator
 *
 * Detects the language of text chunks using the franc library.
 * Annotates chunks with detected language and confidence score.
 *
 * Results are emitted to both the pipeline and session output stream
 * for persistent storage.
 */

import { franc } from 'franc';
import type { AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { annotateChunk } from '../lib/chunk.js';
import { Observable } from '../lib/stream.js';

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

/**
 * Higher-order function that returns a language detection processor.
 * Automatically detects language using the franc library.
 */
export function detectLanguage(session: AgentSessionContext) {
  return (chunk: Chunk): Observable<Chunk> => {
    return new Observable(subscriber => {
      if (chunk.contentType !== 'text') {
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      const text = chunk.content as string;
      if (!text || typeof text !== 'string') {
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      try {
        // Detect language using franc
        const detected = franc(text, { minLength: 3 });
        const confidence = franc(text, { minLength: 3, only: ['eng'] }) === 'eng' ? 1 : 0.8; // Simplified confidence

        const result: LanguageDetectionResult = {
          detectedLanguage: detected,
          confidence
        };

        // Annotate with language detection result
        const annotated = annotateChunk(chunk, 'com.rxcafe.language-detection', result);

        // Emit the annotated chunk to the persistent session stream
        session.outputStream.next(annotated);

        // Pass it down the pipeline
        subscriber.next(annotated);
      } catch (err) {
        console.error('[LanguageDetectionEvaluator] Detection failed:', err);
        subscriber.next(chunk);
      } finally {
        subscriber.complete();
      }
    });
  };
}