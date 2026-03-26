import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { EMPTY, filter, mergeMap, catchError } from '../lib/stream.js';
import { detectToolCalls } from '../evaluators/tool-call-detector.js';
import { executeTools, getToolsSystemPrompt } from '../evaluators/tool-executor.js';
import { completeTurnWithLLM } from '../lib/evaluator-utils.js';

const FILE_TOOLS = ['readFile', 'writeFile', 'updateFile', 'listDirectory', 'glob'];

export const fileSystemAgent: AgentDefinition = {
  name: 'filesystem',
  description: 'File operations via LLM (read, write, update, list, glob)',
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
      session.systemPrompt = `You are a file system assistant. You can help users read, write, update, list, and search for files.
      
${getToolsSystemPrompt(FILE_TOOLS)}`;
    }

    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text' && chunk.annotations['chat.role'] === 'user'),
      
      mergeMap(detectToolCalls()),
      
      mergeMap(chunk => completeTurnWithLLM(chunk, session.createLLMChunkEvaluator(), session)),
      
      mergeMap(detectToolCalls()),
      
      mergeMap(executeTools({ tools: FILE_TOOLS })),
      
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

export default fileSystemAgent;
