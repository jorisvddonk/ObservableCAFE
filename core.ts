/**
 * RXCAFE Core Business Logic
 * Contains session management, LLM evaluators, security, and stream processing
 * No frontend, backend server, or Telegram-specific code
 */

import { 
  createTextChunk, 
  createNullChunk, 
  annotateChunk, 
  type Chunk,
  type Evaluator 
} from './lib/chunk.js';
import { ChunkStream, mergeStreams } from './lib/stream.js';
import { KoboldEvaluator } from './lib/kobold-api.js';
import { OllamaEvaluator } from './lib/ollama-api.js';

// =============================================================================
// Configuration
// =============================================================================

export type LLMBackend = 'kobold' | 'ollama';

export interface CoreConfig {
  backend: LLMBackend;
  koboldBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  tracing: boolean;
}

export function getDefaultConfig(): CoreConfig {
  return {
    backend: (process.env.LLM_BACKEND as LLMBackend) || 'kobold',
    koboldBaseUrl: process.env.KOBOLD_URL || 'http://localhost:5001',
    ollamaBaseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:1b',
    tracing: process.env.RXCAFE_TRACE === '1'
  };
}

// =============================================================================
// Unified LLM Evaluator Interface
// =============================================================================

export interface LLMEvaluator {
  evaluateChunk(chunk: Chunk): AsyncGenerator<Chunk>;
  abort(): Promise<void>;
}

export function createEvaluator(
  backend: LLMBackend, 
  config: CoreConfig,
  model?: string
): LLMEvaluator {
  if (backend === 'ollama') {
    const ollama = new OllamaEvaluator(config.ollamaBaseUrl, model || config.ollamaModel);
    return {
      evaluateChunk: ollama.evaluateChunk.bind(ollama),
      abort: async () => {
        // Ollama doesn't have a direct abort API
      }
    };
  } else {
    const kobold = new KoboldEvaluator(config.koboldBaseUrl);
    return {
      evaluateChunk: kobold.evaluateChunk.bind(kobold),
      abort: async () => {
        await kobold.getAPI().abortGeneration();
      }
    };
  }
}

// =============================================================================
// Session Management
// =============================================================================

export interface Session {
  id: string;
  stream: ChunkStream;
  history: Chunk[];
  llmEvaluator: LLMEvaluator;
  backend: LLMBackend;
  model?: string;
  abortController: AbortController | null;
  trustedChunks: Set<string>;
}

const sessions = new Map<string, Session>();

export function createSession(
  config: CoreConfig,
  backend?: LLMBackend, 
  model?: string
): Session {
  const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const useBackend = backend || config.backend;
  
  // Create the main input stream - this is where all user chunks flow in
  const inputStream = new ChunkStream();
  
  // Create LLM evaluator based on selected backend
  const llmEvaluator = createEvaluator(useBackend, config, model);
  
  const session: Session = {
    id,
    stream: inputStream,
    history: [],
    llmEvaluator,
    backend: useBackend,
    model,
    abortController: null,
    trustedChunks: new Set()
  };
  
  // Archive all chunks to history (avoid duplicates by checking chunk ID)
  inputStream.subscribe((chunk) => {
    const existingIndex = session.history.findIndex(c => c.id === chunk.id);
    if (existingIndex !== -1) {
      // Update existing chunk (e.g., when trust status changes)
      session.history[existingIndex] = chunk;
    } else {
      // Add new chunk
      session.history.push(chunk);
    }
  });
  
  sessions.set(id, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listSessions(): string[] {
  return Array.from(sessions.keys());
}

// =============================================================================
// Security and Trust Management
// =============================================================================

/**
 * Mark a chunk as untrusted (web content, external sources)
 */
export function markUntrusted(chunk: Chunk, source: string): Chunk {
  return annotateChunk(chunk, 'security.trust-level', {
    trusted: false,
    source: source,
    requiresReview: true
  });
}

/**
 * Mark a chunk as trusted
 */
export function markTrusted(chunk: Chunk): Chunk {
  return annotateChunk(chunk, 'security.trust-level', {
    trusted: true,
    source: chunk.annotations['security.trust-level']?.source || 'manual',
    requiresReview: false
  });
}

/**
 * Check if a chunk is trusted
 */
export function isTrusted(chunk: Chunk): boolean {
  return chunk.annotations['security.trust-level']?.trusted === true;
}

/**
 * Fetch web content and create an untrusted chunk
 */
export async function fetchWebContent(url: string): Promise<Chunk> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RXCAFE-Bot/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || 'text/plain';
    
    if (contentType.includes('text/html')) {
      // For HTML, we should extract text content
      const html = await response.text();
      // Simple HTML tag stripping (in production, use a proper HTML parser)
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000); // Limit to 10k chars
      
      const chunk = createTextChunk(text, 'com.rxcafe.web-fetch', {
        'web.source-url': url,
        'web.content-type': contentType,
        'web.fetch-time': Date.now()
      });
      
      return markUntrusted(chunk, `web:${url}`);
    } else {
      // For other content types, store as text
      const text = await response.text();
      const chunk = createTextChunk(text.slice(0, 10000), 'com.rxcafe.web-fetch', {
        'web.source-url': url,
        'web.content-type': contentType,
        'web.fetch-time': Date.now()
      });
      
      return markUntrusted(chunk, `web:${url}`);
    }
  } catch (error) {
    const errorChunk = createTextChunk(
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'com.rxcafe.web-fetch',
      {
        'web.source-url': url,
        'web.error': true
      }
    );
    return markUntrusted(errorChunk, `web:${url}`);
  }
}

/**
 * Toggle trust status for a chunk in a session
 */
export function toggleChunkTrust(
  session: Session, 
  chunkId: string, 
  trusted: boolean
): Chunk | null {
  // Find the chunk in history
  const chunkIndex = session.history.findIndex(c => c.id === chunkId);
  if (chunkIndex === -1) {
    return null;
  }
  
  const chunk = session.history[chunkIndex];
  
  // Update trust status
  if (trusted) {
    session.trustedChunks.add(chunkId);
    const trustedChunk = markTrusted(chunk);
    session.history[chunkIndex] = trustedChunk;
    
    // Re-emit the chunk to the stream so downstream evaluators see the update
    session.stream.emit(trustedChunk);
    
    return trustedChunk;
  } else {
    session.trustedChunks.delete(chunkId);
    const untrustedChunk = markUntrusted(chunk, chunk.annotations['security.trust-level']?.source || 'manual');
    session.history[chunkIndex] = untrustedChunk;
    session.stream.emit(untrustedChunk);
    
    return untrustedChunk;
  }
}

// =============================================================================
// RXCAFE Stream Processing Pipeline
// =============================================================================

/**
 * Create an evaluator that annotates chunks with their chat role
 * Pure transformer - adds metadata without changing content
 */
export function createRoleAnnotator(role: string): Evaluator {
  return (chunk: Chunk) => {
    return annotateChunk(chunk, 'chat.role', role);
  };
}

/**
 * Create an evaluator that filters chunks by content type
 * Returns null chunks for non-matching items (which get filtered downstream)
 */
export function createTypeFilter(allowedTypes: string[]): Evaluator {
  return (chunk: Chunk) => {
    if (!allowedTypes.includes(chunk.contentType)) {
      return createNullChunk('com.rxcafe.filter', {
        'filter.rejected': true,
        'filter.reason': `Type ${chunk.contentType} not in [${allowedTypes.join(', ')}]`
      });
    }
    return chunk;
  };
}

/**
 * Create an evaluator that filters out untrusted chunks for LLM context
 * Only trusted chunks flow through to the LLM
 */
export function createTrustFilter(): Evaluator {
  return (chunk: Chunk) => {
    // Check if chunk has trust-level annotation
    const trustLevel = chunk.annotations['security.trust-level'];
    
    if (trustLevel && trustLevel.trusted === false) {
      // Return null chunk with annotation indicating it was filtered
      return createNullChunk('com.rxcafe.security-filter', {
        'filter.rejected': true,
        'filter.reason': 'Untrusted content - requires user review',
        'filter.source-chunk-id': chunk.id
      });
    }
    
    return chunk;
  };
}

/**
 * Build conversation context from session history
 * Only includes trusted chunks (user messages, assistant responses, trusted web content)
 * Excludes the current chunk (which will be appended separately)
 */
export function buildConversationContext(history: Chunk[], excludeChunkId?: string): string {
  const contextParts: string[] = [];
  
  for (const chunk of history) {
    // Skip the current chunk being processed
    if (chunk.id === excludeChunkId) continue;
    
    // Skip non-text chunks
    if (chunk.contentType !== 'text') continue;
    
    const role = chunk.annotations['chat.role'];
    const trustLevel = chunk.annotations['security.trust-level'];
    const isChunkTrusted = !trustLevel || trustLevel.trusted === true;
    
    // Skip untrusted content
    if (!isChunkTrusted) continue;
    
    const content = chunk.content as string;
    
    if (role === 'user') {
      contextParts.push(`User: ${content}`);
    } else if (role === 'assistant') {
      contextParts.push(`Assistant: ${content}`);
    } else if (chunk.producer === 'com.rxcafe.web-fetch' || chunk.annotations['web.source-url']) {
      // Web content that has been trusted
      const url = chunk.annotations['web.source-url'] || 'unknown';
      contextParts.push(`[Web content from ${url}]: ${content}`);
    }
  }
  
  return contextParts.join('\n\n');
}

/**
 * Create an evaluator that wraps the LLM evaluator
 * This demonstrates flatMap pattern - one input chunk generates multiple output chunks
 * Now includes full conversation context from trusted chunks
 */
export function createLLMStreamEvaluator(
  llmEvaluator: LLMEvaluator,
  backend: LLMBackend,
  sessionHistory: Chunk[],
  onToken: (token: string) => void,
  onFinish: () => void,
  abortSignal: AbortSignal,
  tracing: boolean = false
): Evaluator {
  return async (chunk: Chunk) => {
    // Only process text chunks from users
    if (chunk.contentType !== 'text') {
      return chunk;
    }
    
    if (chunk.annotations['chat.role'] !== 'user') {
      return chunk;
    }
    
    // Build full conversation context including trusted web content
    // Exclude current chunk since we'll append it separately
    const context = buildConversationContext(sessionHistory, chunk.id);
    const currentMessage = chunk.content as string;
    
    // Create prompt with full context
    const prompt = context 
      ? `${context}\n\nUser: ${currentMessage}\nAssistant:`
      : `User: ${currentMessage}\nAssistant:`;
    
    // RXCAFE_TRACE: Log the context being sent to LLM
    if (tracing) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('RXCAFE_TRACE: LLM Context');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Chunk ID: ${chunk.id}`);
      console.log(`Producer: ${chunk.producer}`);
      console.log(`Context Length: ${context.length} chars`);
      console.log(`Current Message Length: ${currentMessage.length} chars`);
      console.log(`Total Prompt Length: ${prompt.length} chars`);
      console.log('\n--- FULL CONTEXT SENT TO LLM ---');
      console.log(prompt);
      console.log('--- END CONTEXT ---\n');
      
      console.log('Trusted chunks in history:');
      let trustedCount = 0;
      for (const h of sessionHistory) {
        const trust = h.annotations['security.trust-level'];
        if (h.contentType === 'text' && (!trust || trust.trusted === true)) {
          trustedCount++;
          const role = h.annotations['chat.role'] || h.producer;
          console.log(`  - ${role}: ${(h.content as string).substring(0, 50)}...`);
        }
      }
      console.log(`Total trusted chunks: ${trustedCount}`);
      console.log('═══════════════════════════════════════════════════════════\n');
    }
    
    // Create a context chunk with the full prompt
    const contextChunk = createTextChunk(prompt, chunk.producer, {
      ...chunk.annotations,
      'llm.context-length': context.length,
      'llm.full-prompt': true
    });
    
    // Use flatMap semantics: one input chunk generates multiple output chunks
    const outputs: Chunk[] = [];
    
    // Emit marker that generation started
    outputs.push(createNullChunk('com.rxcafe.llm', {
      'llm.generation-started': true,
      'llm.backend': backend,
      'llm.parent-chunk-id': chunk.id
    }));
    
    try {
      // Stream tokens from LLM - each token becomes its own chunk
      for await (const tokenChunk of llmEvaluator.evaluateChunk(contextChunk)) {
        if (abortSignal.aborted) {
          break;
        }
        
        outputs.push(tokenChunk);
        
        // Callback for real-time streaming
        if (tokenChunk.contentType === 'text') {
          onToken(tokenChunk.content as string);
        }
      }
      
      onFinish();
    } catch (error) {
      outputs.push(createNullChunk('com.rxcafe.error', {
        'error.message': error instanceof Error ? error.message : 'LLM error',
        'error.source-chunk-id': chunk.id
      }));
    }
    
    return outputs;
  };
}

/**
 * Build a complete chat processing pipeline using stream composition
 * 
 * Pipeline: Input -> [Filter] -> [Annotate] -> [Security Filter] -> [flatMap LLM] -> Output
 */
export function buildChatPipeline(
  inputStream: ChunkStream,
  llmEvaluator: LLMEvaluator,
  backend: LLMBackend,
  sessionHistory: Chunk[],
  onToken: (token: string) => void,
  onFinish: () => void,
  abortSignal: AbortSignal,
  tracing: boolean = false
): ChunkStream {
  // Step 1: Filter to only allow text chunks
  const textOnlyStream = inputStream.pipe(createTypeFilter(['text']));
  
  // Step 2: Annotate user chunks
  const annotatedStream = textOnlyStream.pipe(createRoleAnnotator('user'));
  
  // Step 3: SECURITY FILTER - Only trusted chunks flow to LLM
  // This implements the RXCAFE security pattern from section 4.3
  const trustedStream = annotatedStream.pipe(createTrustFilter());
  
  // Step 4: Branch stream - trusted user messages go to LLM
  const llmStream = new ChunkStream();
  
  // Set up the LLM evaluator on the trusted stream with full history
  trustedStream.pipe(
    createLLMStreamEvaluator(llmEvaluator, backend, sessionHistory, onToken, onFinish, abortSignal, tracing)
  ).pipe((chunk: Chunk) => {
    llmStream.emit(chunk);
    return chunk;
  });
  
  // Step 5: Merge streams - combine all input with LLM responses
  // Note: We merge from annotatedStream (all chunks) not just trusted ones
  // This way untrusted chunks still appear in UI but don't go to LLM
  const combinedStream = mergeStreams(annotatedStream, llmStream);
  
  // Step 6: Final transformation - annotate assistant responses
  const outputStream = combinedStream.map((chunk: Chunk) => {
    if (chunk.contentType === 'text' && 
        (chunk.producer === 'com.rxcafe.kobold-evaluator' || 
         chunk.producer === 'com.rxcafe.ollama-evaluator')) {
      return annotateChunk(chunk, 'chat.role', 'assistant');
    }
    return chunk;
  });
  
  return outputStream;
}

// =============================================================================
// Model Listing
// =============================================================================

export async function listModels(config: CoreConfig, backend?: string): Promise<{ models: string[]; backend: string }> {
  const targetBackend = backend || config.backend;
  
  if (targetBackend === 'ollama') {
    const { OllamaAPI } = await import('./lib/ollama-api.js');
    const api = new OllamaAPI(config.ollamaBaseUrl);
    const models = await api.listModels();
    return { models, backend: 'ollama' };
  } else {
    return { 
      models: [],
      backend: 'kobold'
    };
  }
}

// =============================================================================
// Chat Processing
// =============================================================================

export interface ChatCallbacks {
  onToken: (token: string) => void;
  onFinish: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

export async function processChatMessage(
  session: Session,
  message: string,
  callbacks: ChatCallbacks,
  config: CoreConfig
): Promise<void> {
  // Create abort controller for this generation
  const abortController = new AbortController();
  session.abortController = abortController;
  
  let fullResponse = '';
  
  // Build processing pipeline
  const outputStream = buildChatPipeline(
    session.stream,
    session.llmEvaluator,
    session.backend,
    session.history,
    (token: string) => {
      fullResponse += token;
      callbacks.onToken(token);
    },
    () => {
      // Create final assistant chunk with complete response
      const assistantChunk = createTextChunk(fullResponse, 'com.rxcafe.assistant', {
        'chat.role': 'assistant'
      });
      session.stream.emit(assistantChunk);
      callbacks.onFinish(fullResponse);
    },
    abortController.signal,
    config.tracing
  );
  
  // Subscribe to pipeline output
  outputStream.subscribe(() => {
    // Pipeline is running
  });
  
  // Emit user message to start the pipeline
  const userChunk = createTextChunk(message, 'com.rxcafe.user', {
    'chat.role': 'user'
  });
  session.stream.emit(userChunk);
}

export async function abortGeneration(session: Session): Promise<void> {
  if (session.abortController) {
    session.abortController.abort();
    session.abortController = null;
  }
  
  await session.llmEvaluator.abort();
}
