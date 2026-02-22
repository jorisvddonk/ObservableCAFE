#!/usr/bin/env bun

const SERVER_URL = process.env.CAFE_SERVER_URL || 'http://localhost:3000';
const SESSION_ID = process.env.CAFE_SESSION_ID;
const API_TOKEN = process.env.CAFE_API_TOKEN;

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

if (!SESSION_ID) {
  console.error('Usage: CAFE_SESSION_ID=<session-id> CAFE_API_TOKEN=<token> bun run index.ts');
  console.error('   or: bun run index.ts --session <session-id> --token <token>');
  process.exit(1);
}

function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 65 && code <= 90 ? 65 : 97;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function registerAgent(name: string, apiToken: string): Promise<{ agentId: string; apiKey: string }> {
  const res = await fetch(`${SERVER_URL}/api/connected-agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ name, description: 'Applies ROT13 to user messages' }),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to register: ${res.status} ${await res.text()}`);
  }
  
  return res.json();
}

async function subscribe(agentId: string, apiKey: string, sessionId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/connected-agents/${agentId}/subscribe/${sessionId}`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
  });
  
  if (!res.ok) {
    throw new Error(`Failed to subscribe: ${res.status} ${await res.text()}`);
  }
}

async function join(agentId: string, apiKey: string, sessionId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/connected-agents/${agentId}/join/${sessionId}`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
  });
  
  if (!res.ok) {
    throw new Error(`Failed to join: ${res.status} ${await res.text()}`);
  }
}

async function produceChunk(apiKey: string, sessionId: string, content: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/session/${sessionId}/agent-chunk`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      contentType: 'text',
      annotations: { 
        'chat.role': 'assistant',
        'rot13.transformed': true 
      },
    }),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to produce chunk: ${res.status}`);
  }
}

async function streamChunks(
  apiKey: string,
  sessionId: string,
  onChunk: (chunk: any) => void,
): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/session/${sessionId}/stream/agent`, {
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'text/event-stream',
    },
  });
  
  if (!res.ok) {
    throw new Error(`Failed to connect to stream: ${res.status}`);
  }
  
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error('Stream ended (server may have restarted)');
    }
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const chunk = JSON.parse(line.slice(6));
          onChunk(chunk);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
}

async function main() {
  const sessionId = process.argv.includes('--session')
    ? process.argv[process.argv.indexOf('--session') + 1]
    : SESSION_ID;
  
  const apiToken = process.argv.includes('--token')
    ? process.argv[process.argv.indexOf('--token') + 1]
    : API_TOKEN;
  
  if (!apiToken) {
    console.error('Error: API token required. Set CAFE_API_TOKEN or use --token');
    process.exit(1);
  }
  
  let agentId: string | null = null;
  let apiKey: string | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let consecutiveConnectionErrors = 0;
  let isShuttingDown = false;
  
  const cleanup = async () => {
    isShuttingDown = true;
    if (agentId && apiKey) {
      console.log('\nUnregistering agent...');
      try {
        await fetch(`${SERVER_URL}/api/connected-agents/${agentId}`, {
          method: 'DELETE',
          headers: { 'X-API-Key': apiKey },
        });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  while (!isShuttingDown) {
    try {
      if (!agentId || !apiKey) {
        console.log(`Registering ROT13 agent...`);
        const registration = await registerAgent('rot13-agent', apiToken);
        agentId = registration.agentId;
        apiKey = registration.apiKey;
        console.log(`Agent registered: ${agentId}`);
      }
      
      console.log(`Subscribing to session ${sessionId}...`);
      await subscribe(agentId, apiKey, sessionId);
      
      console.log(`Joining session ${sessionId}...`);
      await join(agentId, apiKey, sessionId);
      
      console.log(`Listening for user messages (Ctrl+C to exit)...\n`);
      
      backoffMs = INITIAL_BACKOFF_MS;
      consecutiveConnectionErrors = 0;
      
      await streamChunks(apiKey, sessionId, (chunk) => {
        if (chunk.annotations?.['chat.role'] === 'user' && chunk.contentType === 'text') {
          const original = chunk.content;
          const transformed = rot13(original);
          
          console.log(`User: ${original}`);
          console.log(`ROT13: ${transformed}\n`);
          
          produceChunk(apiKey!, sessionId!, `[ROT13] ${transformed}`).catch(console.error);
        }
      });
    } catch (error: any) {
      if (isShuttingDown) break;
      
      const isConnectionError = error.message?.includes('Unable to connect') || 
                                error.message?.includes('Connection refused') ||
                                error.message?.includes('ECONNREFUSED');
      
      if (isConnectionError) {
        consecutiveConnectionErrors++;
        if (consecutiveConnectionErrors >= 3) {
          console.log(`\nMultiple connection failures, will re-register on next attempt`);
          agentId = null;
          apiKey = null;
        }
      } else {
        consecutiveConnectionErrors = 0;
      }
      
      console.error(`\nError: ${error.message}`);
      console.log(`Reconnecting in ${backoffMs / 1000}s...`);
      
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      
      if (error.message?.includes('401') || error.message?.includes('Invalid API key')) {
        agentId = null;
        apiKey = null;
      }
    }
  }
}

main().catch(console.error);
