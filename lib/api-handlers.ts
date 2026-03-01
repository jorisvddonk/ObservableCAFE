import {
  createTextChunk,
  createNullChunk,
  createBinaryChunk,
  type Chunk
} from './chunk.js';
import { connectedAgentStore } from './connected-agents.js';
import {
  getSession,
  getAgent,
  createSession,
  fetchWebContent,
  toggleChunkTrust,
  addChunkToSession,
  listModels,
  processChatMessage,
  abortGeneration,
  listAgents as listAgentsFromCore,
  listActiveSessions,
  deleteSession,
  type CoreConfig,
  type Session,
  type AddChunkOptions,
  type CreateSessionOptions
} from '../core.js';
import type { LLMParams, RuntimeSessionConfig } from './agent.js';
import { validateConfigAgainstSchema } from './agent.js';
import type { Database } from './database.js';
import type { SessionStore } from './session-store.js';

let config: CoreConfig;
let trustDb: Database;
let sessionStore: SessionStore;

export function initApiHandlers(deps: { config: CoreConfig; trustDb: Database; sessionStore: SessionStore }) {
  config = deps.config;
  trustDb = deps.trustDb;
  sessionStore = deps.sessionStore;
}

export async function handleCreateSession(body?: any): Promise<Response> {
  try {
    const agentId = body?.agentId || 'default';
    const agent = getAgent(agentId);
    
    if (!agent) {
      return new Response(JSON.stringify({ 
        error: 'Agent not found',
        message: `No agent named '${agentId}'`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const runtimeConfig: RuntimeSessionConfig = {};
    
    if (body?.backend) runtimeConfig.backend = body.backend;
    if (body?.model) runtimeConfig.model = body.model;
    if (body?.systemPrompt) runtimeConfig.systemPrompt = body.systemPrompt;
    if (body?.llmParams) runtimeConfig.llmParams = body.llmParams;
    
    if (agent.configSchema) {
      const errors = await validateConfigAgainstSchema(runtimeConfig, agent.configSchema);
      if (errors.length > 0) {
        return new Response(JSON.stringify({ 
          error: 'Invalid configuration',
          message: 'Session configuration does not meet agent requirements',
          validationErrors: errors
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    const session = await createSession(config, { agentId, runtimeConfig });
    
    if (body?.backend || body?.model || body?.systemPrompt || body?.llmParams) {
      const annotations: Record<string, any> = { 'config.type': 'runtime' };
      
      if (body.backend) annotations['config.backend'] = body.backend;
      if (body.model) annotations['config.model'] = body.model;
      if (body.systemPrompt) annotations['config.systemPrompt'] = body.systemPrompt;
      
      if (body.llmParams) {
        const llmParams = body.llmParams;
        const llmKeys = ['temperature', 'maxTokens', 'topP', 'topK', 'repeatPenalty', 'stop', 'seed', 'maxContextLength', 'numCtx'] as const;
        for (const key of llmKeys) {
          if ((llmParams as any)[key] !== undefined) {
            annotations[`config.llm.${key}`] = (llmParams as any)[key];
          }
        }
      }
      
      session.outputStream.next(createNullChunk('com.rxcafe.api', annotations));
    }
    
    return new Response(JSON.stringify({ 
      sessionId: session.id,
      agentName: session.agentName,
      isBackground: session.isBackground,
      message: 'Session created'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to create session',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function handleListAgents(): Promise<Response> {
  const agents = listAgentsFromCore();
  
  return new Response(JSON.stringify({
    agents: agents.map(a => ({
      name: a.name,
      description: a.description,
      startInBackground: a.startInBackground,
      configSchema: a.configSchema || { type: 'object', properties: {} },
    }))
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleListSessions(): Promise<Response> {
  const activeSessions = listActiveSessions();
  const allSessionIds = new Set(activeSessions.map(s => s.id));
  
  if (sessionStore) {
    const persistedSessions = await sessionStore.listAllSessions();
    for (const ps of persistedSessions) {
      if (!allSessionIds.has(ps.id)) {
        activeSessions.push({
          id: ps.id,
          agentName: ps.agentName,
          isBackground: ps.isBackground,
          displayName: ps.id === ps.agentName ? ps.agentName : undefined
        });
      }
    }
  }
  
  return new Response(JSON.stringify({ sessions: activeSessions }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleDeleteSession(sessionId: string): Promise<Response> {
  const success = await deleteSession(sessionId);
  
  return new Response(JSON.stringify({ success, message: success ? 'Session deleted' : 'Session not found or could not be deleted' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleListModels(backend?: string): Promise<Response> {
  try {
    const result = await listModels(config, backend);
    
    if (result.backend === 'kobold') {
      return new Response(JSON.stringify({ 
        backend: 'kobold',
        message: 'KoboldCPP does not support model listing'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to list models',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function handleGetHistory(sessionId: string): Promise<Response> {
  let session = getSession(sessionId);
  
  if (!session && sessionStore) {
    const sessionData = await sessionStore.loadSession(sessionId);
    if (sessionData) {
      const agent = getAgent(sessionData.agentName);
      if (agent) {
        const restoredSession = await createSession(config, {
          agentId: sessionData.agentName,
          isBackground: sessionData.isBackground,
          sessionId: sessionId,
          ...sessionData.config,
          systemPrompt: sessionData.systemPrompt || undefined,
        });
        
        if (restoredSession._agentContext) {
          await restoredSession._agentContext.loadState();
        }
        
        session = restoredSession;
      }
    }
  }
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ 
    sessionId,
    displayName: session.displayName,
    chunks: session.history
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleErrorStream(sessionId: string): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const { observableToStream } = await import('./stream.js');
  
  const errorStream = observableToStream(
    session.errorStream.asObservable(),
    (err: Error) => `data: ${JSON.stringify({ type: 'error', message: err.message, timestamp: Date.now() })}\n\n`
  );
  
  return new Response(errorStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export async function handleFetchWeb(sessionId: string, url: string): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
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
      chunk: chunk,
      message: 'Web content fetched and added as untrusted chunk'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch URL'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function handleAddChunk(sessionId: string, options: AddChunkOptions): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
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
        if (val !== undefined) {
          llmParams[key] = val;
        }
      }
      if (Object.keys(llmParams).length > 0) {
        runtimeConfig.llmParams = llmParams;
      }
      
      const errors = await validateConfigAgainstSchema(runtimeConfig, agent.configSchema);
      if (errors.length > 0) {
        return new Response(JSON.stringify({ 
          error: 'Invalid configuration',
          message: 'Runtime config does not meet agent requirements',
          validationErrors: errors
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
  
  const chunk = addChunkToSession(session, { ...options, emit: isRuntimeConfig });
  
  return new Response(JSON.stringify({
    success: true,
    chunk: chunk
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleToggleTrust(sessionId: string, chunkId: string, trusted: boolean): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const result = toggleChunkTrust(session, chunkId, trusted);
  
  if (!result) {
    return new Response(JSON.stringify({ error: 'Chunk not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    success: true,
    chunkId,
    trusted,
    message: trusted ? 'Chunk marked as trusted and added to LLM context' : 'Chunk marked as untrusted'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleChatStream(
  sessionId: string, 
  message: string,
  isAdmin: boolean = false
): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (message.startsWith('/system ')) {
    const prompt = message.slice(8).trim();
    const chunk = addChunkToSession(session, {
      content: prompt,
      producer: 'com.rxcafe.system-prompt',
      annotations: {
        'chat.role': 'system',
        'system.prompt': true
      }
    });
    return new Response(JSON.stringify({
      type: 'system',
      chunk: chunk,
      message: 'System prompt set'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const stream = new ReadableStream({
    start(controller) {
      processChatMessage(
        session,
        message,
        {
          onToken: (token: string) => {
            try {
              controller.enqueue(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
            } catch { /* controller closed */ }
          },
          onFinish: () => {
            try {
              controller.enqueue(`data: ${JSON.stringify({ type: 'finish' })}\n\n`);
              controller.enqueue(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
              controller.close();
            } catch { /* controller closed */ }
          },
          onError: (error: Error) => {
            try {
              controller.enqueue(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
              controller.close();
            } catch { /* controller closed */ }
          }
        },
        config,
        { 'client.type': 'web', 'admin.authorized': isAdmin }
      ).catch(error => {
        try {
          controller.enqueue(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
          controller.close();
        } catch { /* controller closed */ }
      });
    },
    cancel() {
      abortGeneration(session);
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export function handleSessionStream(sessionId: string): Response {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`));
      
      const outputSub = session.outputStream.subscribe({
        next: (chunk: Chunk) => {
          if (chunk.contentType === 'text' || chunk.contentType === 'binary') {
            try {
              let serializedChunk = chunk;
              if (chunk.contentType === 'binary') {
                serializedChunk = {
                  ...chunk,
                  content: {
                    ...chunk.content,
                    data: Array.from((chunk.content as any).data)
                  }
                };
              }
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', chunk: serializedChunk })}\n\n`));
            } catch (error) {
              console.error('[SSE] Failed to serialize chunk:', chunk.id, error);
            }
          }
        },
        error: (err: Error) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`));
          } catch { /* ignore */ }
        }
      });
      
      const errorSub = session.errorStream.subscribe({
        next: (err: Error) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`));
          } catch { /* ignore */ }
        }
      });
      
      cleanup = () => {
        outputSub.unsubscribe();
        errorSub.unsubscribe();
      };
    },
    cancel() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export async function handleAbort(sessionId: string): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  await abortGeneration(session);
  
  return new Response(JSON.stringify({ message: 'Generation aborted' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleRegisterConnectedAgent(body: { name?: string; description?: string }): Response {
  const name = body.name || 'Unnamed Agent';
  const agent = connectedAgentStore.register(name, body.description);
  
  return new Response(JSON.stringify({
    agentId: agent.id,
    apiKey: agent.apiKey,
    name: agent.name
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleUnregisterConnectedAgent(agentId: string): Response {
  const success = connectedAgentStore.unregister(agentId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(null, { status: 204 });
}

export function handleGetAgentSessions(agentId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    agentId,
    sessions: connectedAgentStore.getSessions(agentId)
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleAgentSubscribe(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const success = connectedAgentStore.subscribe(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleAgentUnsubscribe(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const success = connectedAgentStore.unsubscribe(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Not subscribed to this session' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleAgentJoin(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const success = connectedAgentStore.join(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleAgentLeave(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const success = connectedAgentStore.leave(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Not joined to this session' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleGetSessionConnectedAgents(sessionId: string): Response {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    sessionId,
    agents: connectedAgentStore.getAgentsInSession(sessionId)
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleAgentSessionStream(request: Request, sessionId: string): Response {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-API-Key header required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const agent = connectedAgentStore.getByApiKey(apiKey);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!connectedAgentStore.canReadChunks(agent.id, sessionId)) {
    return new Response(JSON.stringify({ error: 'Not subscribed to this session' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', agentId: agent.id, sessionId })}\n\n`));
      
      const sub = session.outputStream.subscribe({
        next: (chunk: Chunk) => {
          try {
            controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`));
          } catch { /* controller closed */ }
        },
        error: (err: Error) => {
          try {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`));
          } catch { /* ignore */ }
        }
      });
      
      return () => sub.unsubscribe();
    },
    cancel() {}
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export async function handleAgentProduceChunk(request: Request, sessionId: string): Promise<Response> {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-API-Key header required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const agent = connectedAgentStore.getByApiKey(apiKey);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!connectedAgentStore.canProduceChunk(agent.id, sessionId)) {
    return new Response(JSON.stringify({ error: 'Not joined to this session' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const body = await request.json().catch(() => ({}));
  
  const chunk = addChunkToSession(session, {
    content: body.content,
    contentType: body.contentType,
    producer: `com.observablecafe.connected-agent.${agent.id}`,
    annotations: body.annotations,
    emit: true
  });
  
  return new Response(JSON.stringify({
    success: true,
    chunk
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleSystemCommand(request: Request): Promise<Response> {
  const systemSession = getSession('system');
  
  if (!systemSession) {
    return new Response(JSON.stringify({ error: 'System agent not running' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const body = await request.json().catch(() => ({}));
  const command = body.command;
  
  if (!command || typeof command !== 'string') {
    return new Response(JSON.stringify({ error: 'Command required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Promise((resolve) => {
    let responseText = '';
    let responded = false;
    
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        sub.unsubscribe();
        resolve(new Response(JSON.stringify({ error: 'Command timeout' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }, 10000);
    
    const sub = systemSession.outputStream.subscribe({
      next: (chunk: Chunk) => {
        if (chunk.annotations['system.response'] || chunk.annotations['system.error']) {
          responseText = chunk.content as string;
        }
        
        if (chunk.annotations['system.response'] || chunk.annotations['system.error']) {
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            sub.unsubscribe();
            resolve(new Response(JSON.stringify({
              success: !chunk.annotations['system.error'],
              response: responseText
            }), {
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        }
      }
    });
    
    systemSession.inputStream.next(createTextChunk(command, 'com.rxcafe.api', {
      'chat.role': 'user',
      'client.type': 'api',
      'admin.authorized': true
    }));
  });
}
