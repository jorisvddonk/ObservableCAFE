import { createNullChunk, createBinaryChunk, type Chunk } from '../chunk.js';
import {
  getSession,
  getAgent,
  fetchWebContent,
  addChunkToSession,
  processChatMessage,
  abortGeneration,
  type CoreConfig,
  type AddChunkOptions
} from '../../core.js';
import type { RuntimeSessionConfig } from '../agent.js';
import { validateConfigAgainstSchema } from '../agent.js';

let config: CoreConfig;

export function init(deps: { config: CoreConfig }) {
  config = deps.config;
}

export async function handleChatStream(sessionId: string, message: string, isAdmin: boolean = false): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  if (message.startsWith('/system ')) {
    const prompt = message.slice(8).trim();
    const chunk = addChunkToSession(session, {
      content: prompt,
      producer: 'com.rxcafe.system-prompt',
      annotations: { 'chat.role': 'system', 'system.prompt': true }
    });
    return new Response(JSON.stringify({ type: 'system', chunk, message: 'System prompt set' }), { headers: { 'Content-Type': 'application/json' } });
  }
  
  const stream = new ReadableStream({
    start(controller) {
      processChatMessage(
        session,
        message,
        {
          onToken: (token: string) => {
            try { controller.enqueue(`data: ${JSON.stringify({ type: 'token', token })}\n\n`); } catch { /* closed */ }
          },
          onFinish: () => {
            try { controller.enqueue(`data: ${JSON.stringify({ type: 'finish' })}\n\n`); controller.enqueue(`data: ${JSON.stringify({ type: 'done' })}\n\n`); controller.close(); } catch { /* closed */ }
          },
          onError: (error: Error) => {
            try { controller.enqueue(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`); controller.close(); } catch { /* closed */ }
          }
        },
        config,
        { 'client.type': 'web', 'admin.authorized': isAdmin }
      ).catch(error => {
        try { controller.enqueue(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`); controller.close(); } catch { /* closed */ }
      });
    },
    cancel() { abortGeneration(session); }
  });
  
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}

export async function handleFetchWeb(sessionId: string, url: string): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  try {
    const fetchedChunk = await fetchWebContent(url);
    const chunk = addChunkToSession(session, {
      content: fetchedChunk.content as string,
      producer: fetchedChunk.producer,
      annotations: fetchedChunk.annotations,
      emit: true
    });
    
    return new Response(JSON.stringify({
      success: true,
      chunk,
      message: 'Web content fetched and added as untrusted chunk'
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch URL'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleAddChunk(sessionId: string, options: AddChunkOptions): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const isRuntimeConfig = options.contentType === 'null' && options.annotations?.['config.type'] === 'runtime';
  
  if (isRuntimeConfig && options.annotations) {
    const agent = getAgent(session.agentName);
    if (agent?.configSchema) {
      const runtimeConfig: RuntimeSessionConfig = {
        backend: options.annotations['config.backend'],
        model: options.annotations['config.model'],
        systemPrompt: options.annotations['config.systemPrompt'],
      };
      
      const llmParams: any = {};
      const llmKeys = ['temperature', 'maxTokens', 'topP', 'topK', 'repeatPenalty', 'stop', 'seed', 'maxContextLength', 'numCtx'];
      for (const key of llmKeys) {
        const val = options.annotations[`config.llm.${key}`];
        if (val !== undefined) llmParams[key] = val;
      }
      if (Object.keys(llmParams).length > 0) runtimeConfig.llmParams = llmParams;
      
      const errors = await validateConfigAgainstSchema(runtimeConfig, agent.configSchema);
      if (errors.length > 0) {
        return new Response(JSON.stringify({ 
          error: 'Invalid configuration',
          message: 'Runtime config does not meet agent requirements',
          validationErrors: errors
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }
  
  const chunk = addChunkToSession(session, { ...options, emit: isRuntimeConfig });
  return new Response(JSON.stringify({ success: true, chunk }), { headers: { 'Content-Type': 'application/json' } });
}

export async function handleAbort(sessionId: string): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  await abortGeneration(session);
  return new Response(JSON.stringify({ message: 'Generation aborted' }), { headers: { 'Content-Type': 'application/json' } });
}

export async function handleListModels(backend?: string): Promise<Response> {
  const { listModels } = await import('../../core.js');
  
  try {
    const result = await listModels(config, backend);
    
    if (result.backend === 'kobold') {
      return new Response(JSON.stringify({ backend: 'kobold', message: 'KoboldCPP does not support model listing' }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to list models',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleListAgents(): Promise<Response> {
  const { listAgents } = await import('../../core.js');
  const agents = listAgents();
  
  return new Response(JSON.stringify({
    agents: agents.map(a => ({
      name: a.name,
      description: a.description,
      startInBackground: a.startInBackground,
      configSchema: a.configSchema || { type: 'object', properties: {} },
    }))
  }), { headers: { 'Content-Type': 'application/json' } });
}
