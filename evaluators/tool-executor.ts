import type { Chunk } from '../lib/chunk.js';
import { createTextChunk } from '../lib/chunk.js';
import { Observable } from '../lib/stream.js';
import { DieRollerTool, DIE_ROLLER_SYSTEM_PROMPT } from '../tools/die-roller.js';

/**
 * Tool executor evaluator for RXCAFE
 * Executes tool calls detected in chunks using registered tools
 */
export function executeTools() {
  const tools = new Map<string, any>();
  tools.set('rollDice', new DieRollerTool());

  return (chunk: Chunk): Observable<Chunk> => {
    return new Observable(subscriber => {
      const toolDetection = chunk.annotations['com.rxcafe.tool-detection'];
      
      if (!toolDetection?.hasToolCalls) {
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      const executionPromises = toolDetection.toolCalls.map(async (call: any) => {
        const tool = tools.get(call.name);
        
        if (!tool) {
          console.warn(`[ToolExecutor] Tool not found: ${call.name}`);
          return null;
        }

        try {
          const result = tool.execute(call.parameters);
          return createTextChunk(
            formatToolResult(call.name, result),
            `com.rxcafe.tool.${call.name}`,
            {
              'chat.role': 'assistant',
              'tool.name': call.name,
              'tool.results': result
            }
          );
        } catch (error) {
          console.error(`[ToolExecutor] Error executing tool ${call.name}:`, error);
          return null;
        }
      });

      Promise.all(executionPromises).then(results => {
        const validResults = results.filter(result => result !== null);
        
        // Always emit the original chunk first
        subscriber.next(chunk);
        
        // Then emit any tool results
        validResults.forEach(result => subscriber.next(result));
        
        subscriber.complete();
      });
    });
  };
}

function formatToolResult(toolName: string, result: any): string {
  if (toolName === 'rollDice') {
    return `${result.expression}: ${result.rolls.join(' + ')} = ${result.total}`;
  }

  return JSON.stringify(result, null, 2);
}

/**
 * System prompt snippet that describes all available tools
 */
export const TOOLS_SYSTEM_PROMPT = `
You have access to the following tools:

${DIE_ROLLER_SYSTEM_PROMPT}
`;
