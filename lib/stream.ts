/**
 * RXCAFE Reactive Stream Utilities
 * Simple stream implementation for chunk processing
 */

import { Chunk, Evaluator } from './chunk.js';

export class ChunkStream {
  private chunks: Chunk[] = [];
  private listeners: Set<(chunk: Chunk) => void> = new Set();
  private evaluators: Array<{ evaluator: Evaluator; output: ChunkStream }> = [];

  subscribe(listener: (chunk: Chunk) => void): () => void {
    this.listeners.add(listener);
    
    for (const chunk of this.chunks) {
      listener(chunk);
    }
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(chunk: Chunk): void {
    this.chunks.push(chunk);
    
    for (const listener of this.listeners) {
      listener(chunk);
    }

    this.processEvaluators(chunk);
  }

  private async processEvaluators(chunk: Chunk): Promise<void> {
    for (const { evaluator, output } of this.evaluators) {
      try {
        const result = await evaluator(chunk);
        if (Array.isArray(result)) {
          for (const r of result) {
            output.emit(r);
          }
        } else {
          output.emit(result);
        }
      } catch (error) {
        console.error('Evaluator error:', error);
      }
    }
  }

  pipe(evaluator: Evaluator): ChunkStream {
    const output = new ChunkStream();
    this.evaluators.push({ evaluator, output });
    return output;
  }

  filter(predicate: (chunk: Chunk) => boolean): ChunkStream {
    const output = new ChunkStream();
    this.subscribe((chunk) => {
      if (predicate(chunk)) {
        output.emit(chunk);
      }
    });
    return output;
  }

  map(transformer: (chunk: Chunk) => Chunk): ChunkStream {
    const output = new ChunkStream();
    this.subscribe((chunk) => {
      output.emit(transformer(chunk));
    });
    return output;
  }

  getHistory(): Chunk[] {
    return [...this.chunks];
  }
}

export function mergeStreams(...streams: ChunkStream[]): ChunkStream {
  const output = new ChunkStream();
  
  for (const stream of streams) {
    stream.subscribe((chunk) => {
      output.emit(chunk);
    });
  }
  
  return output;
}
