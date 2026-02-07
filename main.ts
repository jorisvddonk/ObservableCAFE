/**
 * RXCAFE Chat Application
 * Main entry point - HTTP server with API and frontend
 * 
 * This file wires together:
 * - Core business logic (from core.ts)
 * - HTTP server for API and frontend
 * - Telegram bot integration
 */

import { serve } from 'bun';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  createTextChunk,
  type Chunk
} from './lib/chunk.js';
import {
  getDefaultConfig,
  createSession,
  getSession,
  fetchWebContent,
  toggleChunkTrust,
  listModels,
  processChatMessage,
  abortGeneration,
  type CoreConfig,
  type Session
} from './core.js';
import { TelegramBot, TelegramUser, TelegramConfig } from './lib/telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================================
// Configuration
// =============================================================================

const config: CoreConfig = getDefaultConfig();
const PORT = parseInt(process.env.PORT || '3000');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;

console.log(`RXCAFE Chat Server`);
console.log(`Backend: ${config.backend}`);
console.log(`KoboldCPP URL: ${config.koboldBaseUrl}`);
console.log(`Ollama URL: ${config.ollamaBaseUrl}`);
console.log(`Ollama Model: ${config.ollamaModel}`);
console.log(`Port: ${PORT}`);
console.log(`Tracing: ${config.tracing ? 'ENABLED' : 'disabled'}`);
console.log(`Telegram: ${TELEGRAM_TOKEN ? 'ENABLED' : 'disabled'}`);

// =============================================================================
// Telegram Bot Integration
// =============================================================================

// Map Telegram chat IDs to RXCAFE session IDs
const telegramSessions = new Map<number, string>();

let telegramBot: TelegramBot | null = null;

async function initTelegramBot(): Promise<void> {
  if (!TELEGRAM_TOKEN) {
    console.log('Telegram bot not configured. Set TELEGRAM_TOKEN to enable.');
    return;
  }

  const telegramConfig: TelegramConfig = {
    token: TELEGRAM_TOKEN,
    webhookUrl: TELEGRAM_WEBHOOK_URL,
    polling: !TELEGRAM_WEBHOOK_URL
  };

  telegramBot = new TelegramBot(telegramConfig);
  
  try {
    await telegramBot.init();
    
    // Handle incoming messages
    telegramBot.onMessage(async (chatId, text, user) => {
      console.log(`Telegram message from ${user.first_name} (${chatId}): ${text.substring(0, 50)}...`);
      
      // Get or create session for this chat
      let sessionId = telegramSessions.get(chatId);
      if (!sessionId) {
        console.log(`[Telegram] Creating new session for chat ${chatId}`);
        const session = createSession(config);
        telegramSessions.set(chatId, session.id);
        sessionId = session.id;
        console.log(`[Telegram] Created session ${sessionId}`);
        await telegramBot!.sendMessage(chatId, `🤖 *RXCAFE Bot Started*\n\nSession created with ${config.backend} backend (${session.model || 'default model'}).\n\nAvailable commands:\n/web <URL> - Fetch web content\n/help - Show help`, { parseMode: 'Markdown' });
      }
      
      const session = getSession(sessionId);
      if (!session) {
        await telegramBot!.sendMessage(chatId, '❌ Session error. Please restart with /start');
        return;
      }
      
      // Handle commands
      if (text.startsWith('/start')) {
        await telegramBot!.sendMessage(chatId, `👋 Welcome to RXCAFE Chat!\n\nI'm connected to the ${config.backend} LLM backend.\n\nJust send me a message and I'll respond!`, { parseMode: 'Markdown' });
        return;
      }
      
      if (text.startsWith('/help')) {
        await telegramBot!.sendMessage(chatId, `*Available Commands:*\n\n/web <URL> - Fetch web content (untrusted by default)\n/help - Show this help\n\n*Web Content Trust System:*\nWhen you fetch web content, it's marked as untrusted and won't be used by the LLM until you click the Trust button.`, { parseMode: 'Markdown' });
        return;
      }
      
      if (text.startsWith('/web ')) {
        const url = text.slice(5).trim();
        await handleTelegramWebCommand(chatId, session, url);
        return;
      }
      
      // Regular message - process through LLM
      await handleTelegramMessage(chatId, session, text);
    });
    
    // Handle callback queries (trust buttons)
    telegramBot.onCallback(async (chatId, data, user) => {
      if (data.startsWith('trust:')) {
        const parts = data.split(':');
        const chunkId = parts[1];
        const trusted = parts[2] === 'true';
        
        const sessionId = telegramSessions.get(chatId);
        if (!sessionId) return;
        
        const session = getSession(sessionId);
        if (!session) return;
        
        const result = toggleChunkTrust(session, chunkId, trusted);
        
        if (result) {
          await telegramBot!.sendMessage(chatId, trusted ? '✅ Chunk trusted and added to LLM context' : '❌ Chunk untrusted');
        }
      }
    });
    
  } catch (error) {
    console.error('Failed to initialize Telegram bot:', error);
    telegramBot = null;
  }
}

async function handleTelegramWebCommand(chatId: number, session: Session, url: string): Promise<void> {
  if (!telegramBot) return;
  
  await telegramBot.sendMessage(chatId, `🌐 Fetching ${url}...`);
  
  try {
    const chunk = await fetchWebContent(url);
    session.stream.emit(chunk);
    
    // Store chunk info for trust buttons
    const isTrusted = chunk.annotations?.['security.trust-level']?.trusted === true;
    const messageText = `🌐 *Web Content Fetched*\n\nSource: ${url}\nStatus: ${isTrusted ? '✅ Trusted' : '⚠️ Untrusted'}\n\n${(chunk.content as string).substring(0, 500)}${(chunk.content as string).length > 500 ? '...' : ''}`;
    
    if (!isTrusted) {
      // Send with trust buttons
      await telegramBot.sendMessage(chatId, messageText, {
        parseMode: 'Markdown',
        replyMarkup: telegramBot.createTrustKeyboard(chunk.id)
      });
    } else {
      await telegramBot.sendMessage(chatId, messageText, { parseMode: 'Markdown' });
    }
    
  } catch (error) {
    await telegramBot.sendMessage(chatId, `❌ Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleTelegramMessage(chatId: number, session: Session, message: string): Promise<void> {
  if (!telegramBot) return;
  
  console.log(`[Telegram] Processing message: "${message.substring(0, 50)}..."`);
  
  // Send "typing" indicator
  let statusMessage: any;
  try {
    statusMessage = await telegramBot.sendMessage(chatId, '🤔 Thinking...');
    console.log(`[Telegram] Sent status message, ID: ${statusMessage.message_id}`);
  } catch (error) {
    console.error('[Telegram] Failed to send status message:', error);
  }
  
  let fullResponse = '';
  let messageId: number | null = null;
  let tokenCount = 0;
  
  try {
    console.log(`[Telegram] Starting LLM evaluation...`);
    
    await processChatMessage(
      session,
      message,
      {
        onToken: (token: string) => {
          tokenCount++;
          fullResponse += token;
          
          // Update message every 20 characters to avoid rate limits
          if (fullResponse.length % 20 === 0 && fullResponse.length > 0) {
            updateTelegramMessage(chatId, fullResponse, messageId).then(id => {
              if (id && !messageId) messageId = id;
            });
          }
        },
        onFinish: (response: string) => {
          console.log(`[Telegram] LLM evaluation complete. Tokens: ${tokenCount}, Response length: ${response.length}`);
          
          // Final message update
          finalizeTelegramMessage(chatId, response, messageId, statusMessage?.message_id);
        },
        onError: (error: Error) => {
          console.error('[Telegram] LLM error:', error);
          telegramBot!.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
      },
      config
    );
    
  } catch (error) {
    console.error('[Telegram] Error processing message:', error);
    try {
      await telegramBot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } catch (sendError) {
      console.error('[Telegram] Failed to send error message:', sendError);
    }
  }
}

async function updateTelegramMessage(chatId: number, text: string, messageId: number | null): Promise<number | null> {
  if (!telegramBot) return null;
  
  try {
    if (!messageId) {
      // First update - need to send new message
      const msg = await telegramBot.sendMessage(chatId, text + ' ▌');
      return msg.message_id;
    } else {
      await telegramBot.editMessage(chatId, messageId, text + ' ▌');
      return messageId;
    }
  } catch (error) {
    console.error('[Telegram] Failed to update message:', error);
    return messageId;
  }
}

async function finalizeTelegramMessage(chatId: number, text: string, messageId: number | null, statusMessageId?: number): Promise<void> {
  if (!telegramBot) return;
  
  try {
    if (!messageId) {
      // No updates were made, send final message
      await telegramBot.sendMessage(chatId, text || 'No response');
    } else {
      // Update with final text (no cursor)
      await telegramBot.editMessage(chatId, messageId, text);
    }
    
    // Delete status message if it exists
    if (statusMessageId) {
      // Note: Telegram bots can't easily delete messages, but we could edit it to be empty
      try {
        await telegramBot.editMessage(chatId, statusMessageId, '✅');
      } catch {
        // Ignore errors editing status message
      }
    }
  } catch (error) {
    console.error('[Telegram] Failed to finalize message:', error);
  }
}

// =============================================================================
// API Request Handlers
// =============================================================================

async function handleCreateSession(body?: any): Promise<Response> {
  const backend = body?.backend || config.backend;
  const model = body?.model;
  
  const session = createSession(config, backend, model);
  
  return new Response(JSON.stringify({ 
    sessionId: session.id,
    backend: session.backend,
    model: session.model,
    message: 'Session created'
  }), {
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
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const textChunks = session.history.filter(c => c.contentType === 'text');
  
  return new Response(JSON.stringify({ 
    sessionId,
    backend: session.backend,
    model: session.model,
    chunks: textChunks
  }), {
    headers: { 'Content-Type': 'application/json' }
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
    const chunk = await fetchWebContent(url);
    session.stream.emit(chunk);
    
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
  message: string
): Promise<Response> {
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Build SSE response stream
  const stream = new ReadableStream({
    start(controller) {
      let fullResponse = '';
      
      // Process the chat message
      processChatMessage(
        session,
        message,
        {
          onToken: (token: string) => {
            fullResponse += token;
            controller.enqueue(`data: ${JSON.stringify({
              type: 'token',
              token: token
            })}\n\n`);
          },
          onFinish: (response: string) => {
            controller.enqueue(`data: ${JSON.stringify({ type: 'finish' })}\n\n`);
            controller.enqueue(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            controller.close();
          },
          onError: (error: Error) => {
            controller.enqueue(`data: ${JSON.stringify({ 
              type: 'error',
              error: error.message 
            })}\n\n`);
            controller.close();
          }
        },
        config
      ).catch(error => {
        controller.enqueue(`data: ${JSON.stringify({ 
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })}\n\n`);
        controller.close();
      });
      
      // Send confirmation that user chunk was received
      const userChunk = createTextChunk(message, 'com.rxcafe.user', {
        'chat.role': 'user'
      });
      
      controller.enqueue(`data: ${JSON.stringify({
        type: 'user',
        chunk: userChunk
      })}\n\n`);
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

// =============================================================================
// Frontend Serving
// =============================================================================

function getFrontendHtml(): string {
  try {
    return readFileSync(join(__dirname, 'frontend', 'index.html'), 'utf-8');
  } catch {
    return `<!DOCTYPE html>
<html>
<head><title>RXCAFE Chat</title></head>
<body>
<h1>RXCAFE Chat</h1>
<p>Frontend not found.</p>
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

// =============================================================================
// HTTP Server
// =============================================================================

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
    
    // Telegram webhook endpoint
    if (pathname === '/webhook/telegram' && request.method === 'POST') {
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
    
    // API Routes
    if (pathname === '/api/session' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const response = await handleCreateSession(body);
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
    
    // Web fetch endpoint
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
    
    // Trust toggle endpoint
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
      const message = body.message;
      
      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'Message required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const response = await handleChatStream(sessionId, message);
      return addCors(response, corsHeaders);
    }
    
    if (pathname.match(/^\/api\/chat\/[^/]+\/abort$/) && request.method === 'POST') {
      const sessionId = pathname.split('/')[3];
      const response = await handleAbort(sessionId);
      return addCors(response, corsHeaders);
    }
    
    if (pathname === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok',
        timestamp: Date.now(),
        backend: config.backend,
        koboldUrl: config.koboldBaseUrl,
        ollamaUrl: config.ollamaBaseUrl,
        ollamaModel: config.ollamaModel
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

function addCors(response: Response, corsHeaders: Record<string, string>): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

console.log(`Server running at http://localhost:${PORT}`);

// Initialize Telegram bot (if configured)
initTelegramBot().catch(console.error);
