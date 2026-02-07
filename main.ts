/**
 * RXCAFE Chat Application
 * Main entry point - HTTP server with API and frontend
 */

import { serve } from 'bun';
import { ChunkStream } from './lib/stream.js';
import { createTextChunk, createNullChunk, annotateChunk, Chunk } from './lib/chunk.js';
import { KoboldAPI, KoboldEvaluator } from './lib/kobold-api.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const KOBOLD_BASE_URL = process.env.KOBOLD_URL || 'http://localhost:5001';
const PORT = parseInt(process.env.PORT || '3000');

console.log(`RXCAFE Chat Server`);
console.log(`KoboldCPP URL: ${KOBOLD_BASE_URL}`);
console.log(`Port: ${PORT}`);

interface Session {
  id: string;
  stream: ChunkStream;
  history: Chunk[];
  koboldEvaluator: KoboldEvaluator;
  abortController: AbortController | null;
}

const sessions = new Map<string, Session>();

function createSession(): Session {
  const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const stream = new ChunkStream();
  const koboldEvaluator = new KoboldEvaluator(KOBOLD_BASE_URL);
  
  const session: Session = {
    id,
    stream,
    history: [],
    koboldEvaluator,
    abortController: null
  };
  
  sessions.set(id, session);
  return session;
}

function getFrontendHtml(): string {
  try {
    return readFileSync(join(__dirname, 'frontend', 'index.html'), 'utf-8');
  } catch {
    return `<!DOCTYPE html>
<html>
<head><title>RXCAFE Chat</title></head>
<body>
<h1>RXCAFE Chat</h1>
<p>Frontend not found. Please create frontend/index.html</p>
</body>
</html>`;
  }
}

function getFrontendJs(): string {
  try {
    return readFileSync(join(__dirname, 'frontend', 'app.js'), 'utf-8');
  } catch {
    return 'console.error("Frontend JS not found");';
  }
}

function getFrontendCss(): string {
  try {
    return readFileSync(join(__dirname, 'frontend', 'styles.css'), 'utf-8');
  } catch {
    return '';
  }
}

const server = serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Serve frontend
    if (pathname === '/' || pathname === '/index.html') {
      return new Response(getFrontendHtml(), {
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
    
    // API Routes
    
    // POST /api/session - Create new session
    if (pathname === '/api/session' && request.method === 'POST') {
      const session = createSession();
      
      session.stream.subscribe((chunk) => {
        session.history.push(chunk);
      });
      
      return new Response(JSON.stringify({ 
        sessionId: session.id,
        message: 'Session created'
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // GET /api/session/:id/history - Get session history
    if (pathname.match(/^\/api\/session\/[^/]+\/history$/) && request.method === 'GET') {
      const sessionId = pathname.split('/')[3];
      const session = sessions.get(sessionId);
      
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const textChunks = session.history.filter(c => c.contentType === 'text');
      
      return new Response(JSON.stringify({ 
        sessionId,
        chunks: textChunks
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // POST /api/chat/:sessionId - Send message (streaming)
    if (pathname.match(/^\/api\/chat\/[^/]+$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const session = sessions.get(sessionId);
      
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const body = await request.json();
      const message = body.message;
      
      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'Message required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // Create user chunk
      const userChunk = createTextChunk(message, 'com.rxcafe.user', {
        'chat.role': 'user'
      });
      
      session.stream.emit(userChunk);
      
      // Start streaming response
      const abortController = new AbortController();
      session.abortController = abortController;
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send user chunk confirmation
            controller.enqueue(`data: ${JSON.stringify({
              type: 'user',
              chunk: userChunk
            })}\n\n`);
            
            // Generate LLM response as chunks
            const generator = session.koboldEvaluator.evaluateChunk(userChunk);
            let fullResponse = '';
            
            for await (const chunk of generator) {
              if (abortController.signal.aborted) {
                break;
              }
              
              if (chunk.contentType === 'text') {
                fullResponse += chunk.content;
                session.stream.emit(chunk);
                controller.enqueue(`data: ${JSON.stringify({
                  type: 'token',
                  chunk: chunk
                })}\n\n`);
              } else if (chunk.annotations['llm.finish-reason']) {
                controller.enqueue(`data: ${JSON.stringify({
                  type: 'finish',
                  reason: chunk.annotations['llm.finish-reason']
                })}\n\n`);
              } else if (chunk.annotations['error.message']) {
                controller.enqueue(`data: ${JSON.stringify({
                  type: 'error',
                  error: chunk.annotations['error.message']
                })}\n\n`);
              }
            }
            
            // Create assistant chunk with full response
            if (fullResponse) {
              const assistantChunk = createTextChunk(fullResponse, 'com.rxcafe.assistant', {
                'chat.role': 'assistant',
                'chat.parent-chunk-id': userChunk.id
              });
              session.stream.emit(assistantChunk);
            }
            
            controller.enqueue(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            controller.close();
          } catch (error) {
            controller.enqueue(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            })}\n\n`);
            controller.close();
          }
        },
        cancel() {
          abortController.abort();
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders
        }
      });
    }
    
    // POST /api/chat/:sessionId/abort - Abort generation
    if (pathname.match(/^\/api\/chat\/[^/]+\/abort$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const session = sessions.get(sessionId);
      
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      if (session.abortController) {
        session.abortController.abort();
        session.abortController = null;
      }
      
      await session.koboldEvaluator.getAPI().abortGeneration();
      
      return new Response(JSON.stringify({ message: 'Generation aborted' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // GET /api/health - Health check
    if (pathname === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok',
        timestamp: Date.now(),
        koboldUrl: KOBOLD_BASE_URL
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

console.log(`Server running at http://localhost:${PORT}`);
