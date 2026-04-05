import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { EMPTY, filter, mergeMap, catchError } from '../lib/stream.js';
import { detectToolCalls } from '../evaluators/tool-call-detector.js';
import { executeTools, getToolsSystemPrompt } from '../evaluators/tool-executor.js';
import { completeTurnWithLLM } from '../lib/evaluator-utils.js';

export const bashAgent: AgentDefinition = {
  name: 'bash',
  description: 'Execute bash commands via LLM',
  configSchema: {
    type: 'object',
    properties: {
      backend: { type: 'string', description: 'LLM backend (kobold, ollama, or llamacpp)' },
      model: { type: 'string', description: 'Model name' },
    },
    required: ['backend', 'model']
  },
  
  initialize(session: AgentSessionContext) {
    if (!session.systemPrompt) {
      session.systemPrompt = `You are a bash command executor. When the user asks to run a command, use the bash tool to execute it and report the results.\n\n${getToolsSystemPrompt(['bash'])}`;
    }

    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text' && chunk.annotations['chat.role'] === 'user'),
      
      mergeMap(detectToolCalls()),
      
      mergeMap(chunk => completeTurnWithLLM(chunk, session.createLLMChunkEvaluator(), session)),
      
      mergeMap(detectToolCalls()),
      
      mergeMap(executeTools({ tools: ['bash'] })),
      
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
export default bashAgent;
