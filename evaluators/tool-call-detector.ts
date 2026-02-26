import type { Chunk } from '../lib/chunk.js';
import { annotateChunk } from '../lib/chunk.js';
import { Observable } from '../lib/stream.js';

interface DetectedToolCall {
  name: string;
  parameters: any;
  start: number;
  end: number;
}

export interface ToolDetectionAnnotation {
  toolCalls: DetectedToolCall[];
  hasToolCalls: boolean;
}

/**
 * Tool call detection evaluator for RXCAFE
 * Detects tool call patterns in text chunks and annotates them
 */
export function detectToolCalls() {
  return (chunk: Chunk): Observable<Chunk> => {
    return new Observable(subscriber => {
      if (chunk.contentType !== 'text') {
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      const text = chunk.content as string;
      const toolCalls = parseToolCalls(text);
      const hasToolCalls = toolCalls.length > 0;

      const annotated = annotateChunk(chunk, 'com.rxcafe.tool-detection', {
        toolCalls,
        hasToolCalls
      });

      subscriber.next(annotated);
      subscriber.complete();
    });
  };
}

function parseToolCalls(response: string): DetectedToolCall[] {
  const calls: DetectedToolCall[] = [];
  const startCount = (response.match(/<\|tool_call\|>/g) || []).length;
  const endCount = (response.match(/<\|tool_call_end\|>/g) || []).length;

  if (startCount !== endCount) {
    return calls;
  }

  const toolCallRegex = /<\|tool_call\|>(.*?)<\|tool_call_end\|>/gs;
  let match;

  while ((match = toolCallRegex.exec(response)) !== null) {
    try {
      const callData = JSON.parse(match[1]);
      if (callData.name && callData.parameters !== undefined) {
        calls.push({
          name: callData.name,
          parameters: callData.parameters,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    } catch (e) {
      console.error('[ToolCallDetector] Failed to parse tool call:', e);
    }
  }

  return calls;
}
