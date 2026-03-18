/**
 * Connected Agents API Handlers
 * 
 * REST endpoints for external agent integration:
 * - POST   /api/agents/register          Register new external agent
 * - DELETE /api/agents/:id              Unregister agent
 * - GET    /api/agents/:id/sessions    List agent's sessions
 * - POST   /api/agents/:id/subscribe    Subscribe to session (events only)
 * - POST   /api/agents/:id/unsubscribe  Unsubscribe from session
 * - POST   /api/agents/:id/join         Join session (can read/produce)
 * - POST   /api/agents/:id/leave        Leave session
 * - GET    /api/sessions/:id/agents     List agents in session
 * - GET    /api/sessions/:id/agent-stream  SSE stream for agent
 * - POST   /api/sessions/:id/agent-chunk  Send chunk from agent
 * 
 * Authentication: Bearer token (sk-agent-*)
 * 
 * Modes:
 * - subscribed: Agent receives join/leave events
 * - joined: Agent can read session context and produce chunks
 */

import { getSession } from '../../core.js';
import { connectedAgentStore } from '../connected-agents.js';
import type { Chunk } from '../chunk.js';
import type { AddChunkOptions } from '../../core.js';

export function handleRegisterConnectedAgent(body: { name?: string; description?: string }): Response {
  const name = body.name || 'Unnamed Agent';
  const agent = connectedAgentStore.register(name, body.description);
  
  return new Response(JSON.stringify({
    agentId: agent.id,
    apiKey: agent.apiKey,
    name: agent.name
  }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleUnregisterConnectedAgent(agentId: string): Response {
  const success = connectedAgentStore.unregister(agentId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(null, { status: 204 });
}

export function handleGetAgentSessions(agentId: string): Response {
  const agent = connectedAgentStore.getById(agentId);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({
    agentId,
    sessions: connectedAgentStore.getSessions(agentId)
  }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleAgentSubscribe(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const success = connectedAgentStore.subscribe(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleAgentUnsubscribe(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const success = connectedAgentStore.unsubscribe(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Not subscribed to this session' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleAgentJoin(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const success = connectedAgentStore.join(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleAgentLeave(agentId: string, sessionId: string): Response {
  if (!connectedAgentStore.getById(agentId)) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const success = connectedAgentStore.leave(agentId, sessionId);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Not joined to this session' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleGetSessionConnectedAgents(sessionId: string): Response {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({
    sessionId,
    agents: connectedAgentStore.getAgentsInSession(sessionId)
  }), { headers: { 'Content-Type': 'application/json' } });
}

export function handleAgentSessionStream(request: Request, sessionId: string): Response {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-API-Key header required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  
  const agent = connectedAgentStore.getByApiKey(apiKey);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  
  if (!connectedAgentStore.canReadChunks(agent.id, sessionId)) {
    return new Response(JSON.stringify({ error: 'Not subscribed to this session' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', agentId: agent.id, sessionId })}\n\n`));
      
      const sub = session.outputStream.subscribe({
        next: (chunk: Chunk) => {
          try { controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`)); } catch { /* closed */ }
        },
        error: (err: Error) => {
          try { controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)); } catch { /* ignore */ }
        }
      });
      
      return () => sub.unsubscribe();
    },
    cancel() {}
  });
  
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}

export async function handleAgentProduceChunk(request: Request, sessionId: string): Promise<Response> {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-API-Key header required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  
  const agent = connectedAgentStore.getByApiKey(apiKey);
  
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  
  if (!connectedAgentStore.canProduceChunk(agent.id, sessionId)) {
    return new Response(JSON.stringify({ error: 'Not joined to this session' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  
  const { addChunkToSession } = await import('../../core.js');
  const body = await request.json().catch(() => ({}));
  
  const chunk = addChunkToSession(session, {
    content: body.content,
    contentType: body.contentType,
    producer: `com.observablecafe.connected-agent.${agent.id}`,
    annotations: body.annotations,
    emit: true
  });
  
  return new Response(JSON.stringify({ success: true, chunk }), { headers: { 'Content-Type': 'application/json' } });
}
