/**
 * ObservableCAFE Chat Application
 * Main entry point - HTTP server with API and frontend
 * 
 * This file wires together:
 * - Core business logic (from core.ts)
 * - HTTP server for API and frontend
 * - Telegram bot integration
 * - Client trust system with SQLite
 * 
 * Usage:
 *   bun start                                          # Start server
 *   bun start -- --help                                # Show help
 *   bun start -- --trust <token>                       # Trust a new API client
 *   bun start -- --list-clients                        # List trusted API clients
 *   bun start -- --revoke <id>                         # Revoke a trusted API client
 *   bun start -- --trust-telegram <id_or_username>     # Trust a Telegram user
 *   bun start -- --untrust-telegram <id_or_username>   # Untrust a Telegram user
 *   bun start -- --list-telegram-users                 # List trusted Telegram users
 */

import { serve } from 'bun';
import {
  createTextChunk,
  createNullChunk,
  createBinaryChunk,
  type Chunk
} from './lib/chunk.js';
import { connectedAgentStore, type ConnectedAgent } from './lib/connected-agents.js';
import {
  getDefaultConfig,
  createSession,
  getSession,
  getAgent,
  fetchWebContent,
  toggleChunkTrust,
  addChunkToSession,
  listModels,
  processChatMessage,
  abortGeneration,
  loadAgentsFromDisk,
  startBackgroundAgents,
  restorePersistedSessions,
  listAgents as listAgentsFromCore,
  listActiveSessions,
  deleteSession,
  setSessionStore,
  setCoreConfig,
  shutdown,
  type CoreConfig,
  type Session,
  type AddChunkOptions,
  type CreateSessionOptions
} from './core.js';
import { Database, extractClientToken, maskToken } from './lib/database.js';
import { SessionStore } from './lib/session-store.js';
import type { LLMParams, RuntimeSessionConfig } from './lib/agent.js';
import { validateConfigAgainstSchema } from './lib/agent.js';
import { Subscription } from './lib/stream.js';
import { handleCliCommands } from './lib/cli-handler.js';
import { 
  frontendHandler,
  getFrontendHtml,
  getFrontendJs,
  getFrontendCss,
  getManifest,
  getServiceWorker,
  getIcon,
  getIconSvg,
  getWidgetFile,
  getWidgetCss,
  getJsFile
} from './lib/frontend-server.js';
import { 
  initTelegramHandler, 
  restoreTelegramSubscriptions, 
  getTelegramBot,
  getTelegramState
} from './lib/telegram-handler.js';

handleCliCommands(process.argv.slice(2));

const config: CoreConfig = getDefaultConfig();
setCoreConfig(config);

const PORT = parseInt(process.env.PORT || '3000');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const TRUST_DB_PATH = process.env.TRUST_DB_PATH || './rxcafe-trust.db';

const trustDb = new Database(TRUST_DB_PATH);
connectedAgentStore.setTrustDatabase(trustDb);

const sessionStore = new SessionStore(trustDb.getDatabase());
setSessionStore(sessionStore);

console.log(`RXCAFE Chat Server`);
console.log(`Backend: ${config.backend}`);
console.log(`KoboldCPP URL: ${config.koboldBaseUrl}`);
console.log(`Ollama URL: ${config.ollamaBaseUrl}`);
console.log(`Ollama Model: ${config.ollamaModel}`);
console.log(`Port: ${PORT}`);
console.log(`Tracing: ${config.tracing ? 'ENABLED' : 'disabled'}`);
console.log(`Telegram: ${TELEGRAM_TOKEN ? 'ENABLED' : 'disabled'}`);
console.log(`Trust DB: ${TRUST_DB_PATH}`);
console.log(`Trusted API clients: ${trustDb.getClientCount()}`);
console.log(`Trusted Telegram users: ${trustDb.getTelegramUserCount()}`);

const hasTrustedClients = trustDb.hasTrustedClients();
if (!hasTrustedClients) {
  console.log('');
  console.log('🔒 No trusted API clients configured - ALL API CLIENTS WILL BE BLOCKED');
  console.log('   Run: bun start -- --generate-token [description]');
  console.log('');
}

const hasTrustedTelegramUsers = trustDb.hasTrustedTelegramUsers();
if (TELEGRAM_TOKEN && !hasTrustedTelegramUsers) {
  console.log('');
  console.log('🔒 No trusted Telegram users configured - ALL TELEGRAM USERS WILL BE BLOCKED');
  console.log('   Run: bun start -- --trust-telegram <user_id_or_username> [description]');
  console.log('');
}

function getOrCreateWebToken(): string {
  const existingToken = trustDb.getTokenByDescription('Web Interface');
  if (existingToken) {
    return existingToken;
  }
  return trustDb.addClient('Web Interface');
}

const webToken = getOrCreateWebToken();

function createUntrustedResponse(token: string | null): Response {
  const providedToken = token ? maskToken(token) : 'none';
  
  const body = {
    error: 'Unauthorized',
    message: 'This client is not trusted.',
    providedToken: providedToken,
    instructions: 'An admin needs to authorize this client by running:',
    command: token 
      ? `bun start -- --trust ${token} [description]`
      : 'bun start -- --trust <token> [description]',
    alternative: 'To generate a new token, run: bun start -- --generate-token [description]',
    hint: 'Pass the token via Authorization: Bearer <token> header or ?token=<token> query parameter'
  };
  
  return new Response(JSON.stringify(body, null, 2), {
    status: 401,
    headers: { 
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer'
    }
  });
}

function verifyClient(request: Request): { trusted: boolean; token: string | null } {
  const token = extractClientToken(request);
  if (!token) {
    return { trusted: false, token: null };
  }
  const isTrusted = trustDb.verifyToken(token);
  return { trusted: isTrusted, token };
}

function verifyAdmin(request: Request): { isAdmin: boolean; token: string | null; clientId: number | null } {
  const token = extractClientToken(request);
  if (!token) {
    return { isAdmin: false, token: null, clientId: null };
  }
  const clientId = trustDb.getClientIdByToken(token);
  if (!clientId) {
    return { isAdmin: false, token, clientId: null };
  }
  const isAdmin = trustDb.isAdminToken(token);
  return { isAdmin, token, clientId };
}

function createForbiddenResponse(): Response {
  return new Response(JSON.stringify({
    error: 'Forbidden',
    message: 'Admin privileges required for this operation.'
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}

function verifyAgentAuth(request: Request): { agent: ConnectedAgent } | { error: Response } {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey) {
    return { error: new Response(JSON.stringify({ error: 'X-API-Key header required' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }
  
  const agent = connectedAgentStore.getByApiKey(apiKey);
  
  if (!agent) {
    return { error: new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }
  
  return { agent };
}

async function handleCreateSession(body?: any): Promise<Response> {
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
    
    const options: CreateSessionOptions = {
      agentId,
      runtimeConfig,
    };
    
    const session = await createSession(config, options);
    
    if (body?.backend || body?.model || body?.systemPrompt || body?.llmParams) {
      const annotations: Record<string, any> = {
        'config.type': 'runtime',
      };
      
      if (body.backend) annotations['config.backend'] = body.backend;
      if (body.model) annotations['config.model'] = body.model;
      if (body.systemPrompt) annotations['config.systemPrompt'] = body.systemPrompt;
      
      if (body.llmParams) {
        const llmParams = body.llmParams;
        if (llmParams.temperature !== undefined) annotations['config.llm.temperature'] = llmParams.temperature;
        if (llmParams.maxTokens !== undefined) annotations['config.llm.maxTokens'] = llmParams.maxTokens;
        if (llmParams.topP !== undefined) annotations['config.llm.topP'] = llmParams.topP;
        if (llmParams.topK !== undefined) annotations['config.llm.topK'] = llmParams.topK;
        if (llmParams.repeatPenalty !== undefined) annotations['config.llm.repeatPenalty'] = llmParams.repeatPenalty;
        if (llmParams.stop !== undefined) annotations['config.llm.stop'] = llmParams.stop;
        if (llmParams.seed !== undefined) annotations['config.llm.seed'] = llmParams.seed;
        if (llmParams.maxContextLength !== undefined) annotations['config.llm.maxContextLength'] = llmParams.maxContextLength;
        if (llmParams.numCtx !== undefined) annotations['config.llm.numCtx'] = llmParams.numCtx;
      }
      
      const configChunk = createNullChunk('com.rxcafe.api', annotations);
      session.outputStream.next(configChunk);
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

async function handleListAgents(): Promise<Response> {
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

async function handleListSessions(): Promise<Response> {
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

async function handleDeleteSession(sessionId: string): Promise<Response> {
  const success = await deleteSession(sessionId);
  
  return new Response(JSON.stringify({ success, message: success ? 'Session deleted' : 'Session not found or could not be deleted' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleListModels(backend?: string): Promise<Response> {
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

async function handleGetHistory(sessionId: string): Promise<Response> {
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
  
  const historyChunks = session.history;
  
  return new Response(JSON.stringify({ 
    sessionId,
    displayName: session.displayName,
    chunks: historyChunks
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleErrorStream(sessionId: string): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const { Subject, Observable } = await import('./lib/stream.js');
  const { observableToStream } = await import('./lib/stream.js');
  
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

async function handleFetchWeb(sessionId: string, url: string): Promise<Response> {
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

async function handleAddChunk(sessionId: string, options: AddChunkOptions): Promise<Response> {
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

async function handleToggleTrust(sessionId: string, chunkId: string, trusted: boolean): Promise<Response> {
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

async function handleChatStream(
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
              controller.enqueue(`data: ${JSON.stringify({
                type: 'token',
                token: token
              })}\n\n`);
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
              controller.enqueue(`data: ${JSON.stringify({ 
                type: 'error',
                error: error.message 
              })}\n\n`);
              controller.close();
            } catch { /* controller closed */ }
          }
        },
        config,
        { 'client.type': 'web', 'admin.authorized': isAdmin }
      ).catch(error => {
        try {
          controller.enqueue(`data: ${JSON.stringify({ 
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`);
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

function handleSessionStream(sessionId: string): Response {
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
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'chunk',
                chunk: serializedChunk
              })}\n\n`));
            } catch (error) {
              console.error('[SSE] Failed to serialize chunk:', chunk.id, error);
            }
          }
        },
        error: (err: Error) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: err.message
            })}\n\n`));
          } catch { /* ignore */ }
        }
      });
      
      const errorSub = session.errorStream.subscribe({
        next: (err: Error) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: err.message
            })}\n\n`));
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

async function handleAbort(sessionId: string): Promise<Response> {
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

function handleRegisterConnectedAgent(body: { name?: string; description?: string }): Response {
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

function handleUnregisterConnectedAgent(agentId: string): Response {
  const success = connectedAgentStore.unregister(agentId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(null, { status: 204 });
}

function handleGetAgentSessions(agentId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const sessions = connectedAgentStore.getSessions(agentId);
  
  return new Response(JSON.stringify({
    agentId,
    sessions
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function handleAgentSubscribe(agentId: string, sessionId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
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

function handleAgentUnsubscribe(agentId: string, sessionId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
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

function handleAgentJoin(agentId: string, sessionId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
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

function handleAgentLeave(agentId: string, sessionId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
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

function handleGetSessionConnectedAgents(sessionId: string): Response {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const agents = connectedAgentStore.getAgentsInSession(sessionId);
  
  return new Response(JSON.stringify({
    sessionId,
    agents
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function handleAgentSessionStream(request: Request, sessionId: string): Response {
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

async function handleAgentProduceChunk(request: Request, sessionId: string): Promise<Response> {
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

async function handleSystemCommand(request: Request): Promise<Response> {
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
    
    const commandChunk = createTextChunk(command, 'com.rxcafe.api', {
      'chat.role': 'user',
      'client.type': 'api',
      'admin.authorized': true
    });
    
    systemSession.inputStream.next(commandChunk);
  });
}

function addCors(response: Response, corsHeaders: Record<string, string>): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

const server = serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    if (pathname === '/' || pathname === '/index.html') {
      return new Response(getFrontendHtml(webToken), {
        headers: { 'Content-Type': 'text/html', ...corsHeaders }
      });
    }
    
    if (pathname === '/app.js') {
      return new Response(getFrontendJs(), {
        headers: { 'Content-Type': 'application/javascript', ...corsHeaders }
      });
    }
    
    if (pathname === '/styles.css') {
      return new Response(getFrontendCss(), {
        headers: { 'Content-Type': 'text/css', ...corsHeaders }
      });
    }
    
    if (pathname === '/manifest.json') {
      return new Response(getManifest(), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    if (pathname === '/sw.js') {
      return new Response(getServiceWorker(), {
        headers: { 'Content-Type': 'application/javascript', ...corsHeaders }
      });
    }
    
    if (pathname === '/widgets/styles.css') {
      return new Response(getWidgetCss(), {
        headers: { 'Content-Type': 'text/css', ...corsHeaders }
      });
    }
    
    if (pathname.startsWith('/widgets/')) {
      const filename = pathname.slice(9);
      const content = getWidgetFile(filename);
      if (content !== null) {
        const contentType = filename.endsWith('.js') ? 'application/javascript' : 
                           filename.endsWith('.css') ? 'text/css' : 'text/plain';
        return new Response(content, {
          headers: { 'Content-Type': contentType, ...corsHeaders }
        });
      }
    }
    
    if (pathname.startsWith('/js/')) {
      const filename = pathname.slice(4);
      const content = getJsFile(filename);
      if (content !== null) {
        return new Response(content, {
          headers: { 'Content-Type': 'application/javascript', ...corsHeaders }
        });
      }
    }
    
    if (pathname === '/icon.svg') {
      return new Response(getIconSvg(), {
        headers: { 'Content-Type': 'image/svg+xml', ...corsHeaders }
      });
    }
    
    if (pathname === '/icon-192.png') {
      const icon = getIcon(192);
      if (icon) {
        return new Response(icon, {
          headers: { 'Content-Type': 'image/png', ...corsHeaders }
        });
      }
      return new Response(getIconSvg(), {
        headers: { 'Content-Type': 'image/svg+xml', ...corsHeaders }
      });
    }
    
    if (pathname === '/icon-512.png') {
      const icon = getIcon(512);
      if (icon) {
        return new Response(icon, {
          headers: { 'Content-Type': 'image/png', ...corsHeaders }
        });
      }
      return new Response(getIconSvg(), {
        headers: { 'Content-Type': 'image/svg+xml', ...corsHeaders }
      });
    }
    
    if (pathname === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok',
        timestamp: Date.now(),
        backend: config.backend,
        koboldUrl: config.koboldBaseUrl,
        ollamaUrl: config.ollamaBaseUrl,
        ollamaModel: config.ollamaModel,
        authRequired: true,
        trustedClients: trustDb.getClientCount()
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    if (pathname.match(/^\/api\/connected-agents\/[^/]+$/) && request.method === 'DELETE') {
      const agentId = pathname.split('/')[3];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      if (authResult.agent.id !== agentId) {
        return addCors(new Response(JSON.stringify({ error: 'Agent ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), corsHeaders);
      }
      const response = handleUnregisterConnectedAgent(agentId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/connected-agents\/[^/]+\/sessions$/) && request.method === 'GET') {
      const agentId = pathname.split('/')[3];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      if (authResult.agent.id !== agentId) {
        return addCors(new Response(JSON.stringify({ error: 'Agent ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), corsHeaders);
      }
      const response = handleGetAgentSessions(agentId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/connected-agents\/[^/]+\/subscribe\/[^/]+$/) && request.method === 'POST') {
      const parts = pathname.split('/');
      const agentId = parts[3];
      const sessionId = parts[5];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      if (authResult.agent.id !== agentId) {
        return addCors(new Response(JSON.stringify({ error: 'Agent ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), corsHeaders);
      }
      const response = handleAgentSubscribe(agentId, sessionId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/connected-agents\/[^/]+\/subscribe\/[^/]+$/) && request.method === 'DELETE') {
      const parts = pathname.split('/');
      const agentId = parts[3];
      const sessionId = parts[5];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      if (authResult.agent.id !== agentId) {
        return addCors(new Response(JSON.stringify({ error: 'Agent ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), corsHeaders);
      }
      const response = handleAgentUnsubscribe(agentId, sessionId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/connected-agents\/[^/]+\/join\/[^/]+$/) && request.method === 'POST') {
      const parts = pathname.split('/');
      const agentId = parts[3];
      const sessionId = parts[5];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      if (authResult.agent.id !== agentId) {
        return addCors(new Response(JSON.stringify({ error: 'Agent ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), corsHeaders);
      }
      const response = handleAgentJoin(agentId, sessionId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/connected-agents\/[^/]+\/join\/[^/]+$/) && request.method === 'DELETE') {
      const parts = pathname.split('/');
      const agentId = parts[3];
      const sessionId = parts[5];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      if (authResult.agent.id !== agentId) {
        return addCors(new Response(JSON.stringify({ error: 'Agent ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), corsHeaders);
      }
      const response = handleAgentLeave(agentId, sessionId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/session\/[^/]+\/connected-agents$/) && request.method === 'GET') {
      const sessionId = pathname.split('/')[3];
      const authResult = verifyAgentAuth(request);
      if ('error' in authResult) return addCors(authResult.error, corsHeaders);
      const response = handleGetSessionConnectedAgents(sessionId);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/session\/[^/]+\/stream\/agent$/) && request.method === 'GET') {
      const sessionId = pathname.split('/')[3];
      const response = handleAgentSessionStream(request, sessionId);
      return response;
    }

    if (pathname.match(/^\/api\/session\/[^/]+\/agent-chunk$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const response = await handleAgentProduceChunk(request, sessionId);
      return addCors(response, corsHeaders);
    }
    
    const { trusted, token } = verifyClient(request);
    if (!trusted) {
      return addCors(createUntrustedResponse(token), corsHeaders);
    }
    
    if (pathname === '/webhook/telegram' && request.method === 'POST') {
      const telegramBot = getTelegramBot();
      if (!telegramBot) {
        return new Response(JSON.stringify({ error: 'Telegram bot not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const update = await request.json();
      await telegramBot.handleUpdate(update);
      
      return new Response('OK', { status: 200 });
    }
    
    if (pathname === '/api/agents' && request.method === 'GET') {
      const response = await handleListAgents();
      return addCors(response, corsHeaders);
    }
    
    if (pathname === '/api/sessions' && request.method === 'GET') {
      const response = await handleListSessions();
      return addCors(response, corsHeaders);
    }
    
    if (pathname === '/api/session' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const response = await handleCreateSession(body);
      return addCors(response, corsHeaders);
    }

    if (pathname.match(/^\/api\/session\/[^/]+$/) && request.method === 'DELETE') {
      const sessionId = pathname.split('/')[3];
      const response = await handleDeleteSession(sessionId);
      return addCors(response, corsHeaders);
    }
    
    if (pathname === '/api/models' && request.method === 'GET') {
      const backend = url.searchParams.get('backend') || undefined;
      const response = await handleListModels(backend);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/session\/[^/]+\/history$/) && request.method === 'GET') {
      const sessionId = pathname.split('/')[3];
      const response = await handleGetHistory(sessionId);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/session\/[^/]+\/stream$/) && request.method === 'GET') {
      const sessionId = pathname.split('/')[3];
      const response = handleSessionStream(sessionId);
      return response;
    }
    
    if (pathname.match(/^\/api\/session\/[^/]+\/errors$/) && request.method === 'GET') {
      const sessionId = pathname.split('/')[3];
      const response = await handleErrorStream(sessionId);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/session\/[^/]+\/web$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const body = await request.json();
      const urlToFetch = body.url;
      
      if (!urlToFetch) {
        return new Response(JSON.stringify({ error: 'URL required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const response = await handleFetchWeb(sessionId, urlToFetch);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/session\/[^/]+\/chunk$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const body = await request.json();
      
      const response = await handleAddChunk(sessionId, {
        content: body.content,
        contentType: body.contentType,
        producer: body.producer,
        annotations: body.annotations,
        emit: body.emit === true
      });
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/session\/[^/]+\/chunk\/[^/]+\/trust$/) && request.method === 'POST') {
      const parts = pathname.split('/');
      const sessionId = parts[3];
      const chunkId = parts[5];
      const body = await request.json();
      const trusted = body.trusted === true;
      
      const response = await handleToggleTrust(sessionId, chunkId, trusted);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/chat\/[^/]+$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const body = await request.json();
      
      if (body.audio) {
        const session = getSession(sessionId);
        if (!session) {
          return new Response(JSON.stringify({ error: 'Session not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const { data, mimeType, duration } = body.audio;
        if (!data || !mimeType) {
          return new Response(JSON.stringify({ error: 'Audio data and MIME type required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        let audioUint8;
        if (Array.isArray(data)) {
          audioUint8 = new Uint8Array(data);
        } else if (typeof data === 'object' && data !== null) {
          if (data.type === 'Buffer' && Array.isArray(data.data)) {
            audioUint8 = new Uint8Array(data.data);
          } else {
            audioUint8 = new Uint8Array(Object.values(data));
          }
        } else {
          return new Response(JSON.stringify({ error: 'Invalid audio data format' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const audioChunk = createBinaryChunk(
          audioUint8,
          mimeType,
          'com.rxcafe.user',
          {
            'chat.role': 'user',
            'audio.duration': duration,
            'client.type': 'web',
            'admin.authorized': verifyAdmin(request).isAdmin
          }
        );
        
        session.inputStream.next(audioChunk);
        
        return new Response(JSON.stringify({
          success: true,
          chunk: audioChunk
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const message = body.message;
      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'Message or audio required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const { isAdmin } = verifyAdmin(request);
      const response = await handleChatStream(sessionId, message, isAdmin);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/chat\/[^/]+\/abort$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const response = await handleAbort(sessionId);
      return addCors(response, corsHeaders);
    }

    if (pathname === '/api/connected-agents' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const response = handleRegisterConnectedAgent(body);
      return addCors(response, corsHeaders);
    }
    
    if (pathname === '/api/system/command' && request.method === 'POST') {
      const { isAdmin, token } = verifyAdmin(request);
      if (!isAdmin) {
        return addCors(createForbiddenResponse(), corsHeaders);
      }
      const response = await handleSystemCommand(request);
      return addCors(response, corsHeaders);
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

console.log(`Server running at http://localhost:${PORT}?token=${webToken}`);

(async () => {
  console.log('[Server] Loading agents...');
  await loadAgentsFromDisk();
  
  const agents = listAgentsFromCore();
  console.log(`[Server] Loaded ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);
  
  console.log('[Server] Restoring persisted sessions...');
  const restoredCount = await restorePersistedSessions(config);
  if (restoredCount > 0) {
    console.log(`[Server] Restored ${restoredCount} sessions from persistence`);
  }
  
  console.log('[Server] Starting background agents...');
  await startBackgroundAgents(config);
  
  await initTelegramHandler({
    trustDb,
    sessionStore,
    config
  });
  
  await restoreTelegramSubscriptions();
})();

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  shutdown();
  trustDb.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  shutdown();
  trustDb.close();
  process.exit(0);
});
