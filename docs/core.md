# Core Library

The `lib/` directory contains the core types and utilities that power ObservableCAFE.

## Types

### Chunk (`lib/chunk.ts`)

The fundamental data unit in ObservableCAFE.

```typescript
interface Chunk {
  id: string;                    // Unique identifier
  timestamp: number;             // Creation timestamp
  contentType: 'text' | 'binary' | 'null';
  content: string | BinaryContent | null;
  producer: string;              // Source of the chunk
  annotations: Record<string, any>; // Metadata
}
```

#### Helper Functions

```typescript
// Create a text chunk
createTextChunk(content: string, producer: string, annotations?: object): Chunk

// Create a null chunk (for metadata)
createNullChunk(producer: string, annotations?: object): Chunk

// Create a binary chunk (for images, audio, files)
createBinaryChunk(data: Uint8Array, mimeType: string, producer: string, annotations?: object): Chunk

// Add annotation to existing chunk
annotateChunk(chunk: Chunk, key: string, value: any): Chunk
```

#### Binary Content

```typescript
interface BinaryContent {
  data: Uint8Array;   // Raw binary data
  mimeType: string;   // MIME type (image/png, audio/wav, etc.)
}
```

---

### Agent (`lib/agent.ts`)

#### AgentDefinition

```typescript
interface AgentDefinition {
  name: string;                    // Unique identifier
  description?: string;             // Human-readable description
  startInBackground?: boolean;     // Auto-start on server boot
  allowsReload?: boolean;          // Can be reloaded at runtime (default: true)
  persistsState?: boolean;          // Save/restore state (default: true)
  configSchema?: object;            // JSON Schema for runtime config
  supportedUIs?: string[];         // Supported UI modes

  initialize(session: AgentSessionContext): void | Promise<void>;
  destroy?(session: AgentSessionContext): void | Promise<void>;
}
```

#### AgentSessionContext

```typescript
interface AgentSessionContext {
  id: string;                      // Session ID
  agentName: string;               // Agent name
  isBackground: boolean;           // Background agent flag

  inputStream: Subject<Chunk>;     // Incoming chunks
  outputStream: Subject<Chunk>;   // Outgoing chunks
  errorStream: Subject<Error>;     // Error stream

  history: Chunk[];                // Session history

  config: CoreConfig;              // Server config
  sessionConfig: SessionConfig;    // Per-session config
  systemPrompt: string | null;     // System prompt

  // Create LLM evaluator for this session
  createLLMChunkEvaluator(params?: LLMParams): AgentEvaluator;
  createLLMChunkEvaluator(backend, model?, params?): AgentEvaluator;

  // Schedule background tasks (for background agents)
  schedule(cronExpr: string, callback: () => void | Promise<void>): () => void;

  // State persistence
  persistState(): Promise<void>;
  loadState(): Promise<void>;

  trustedChunks: Set<string>;      // Trusted content
  callbacks: ChatCallbacks | null; // UI callbacks
}
```

#### LLMParams

```typescript
interface LLMParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  stop?: string[];
  seed?: number;
  maxContextLength?: number;  // KoboldCPP
  numCtx?: number;            // Ollama
}
```

---

## Stream (`lib/stream.ts`)

Re-exports RxJS utilities plus ObservableCAFE-specific helpers.

```typescript
import { Subject, Observable, filter, map, mergeMap, catchError, EMPTY } from 'rxjs';
import { of, from } from 'rxjs';

// Convert Observable to ReadableStream for SSE
function observableToStream(observable: Observable<Chunk>): ReadableStream<Chunk>;
```

---

## Utilities

### Evaluator Utils (`lib/evaluator-utils.ts`)

#### completeTurnWithLLM

Standard utility for processing chunks through an LLM evaluator:

```typescript
completeTurnWithLLM(
  chunk: Chunk,
  evaluator: AgentEvaluator,
  session: AgentSessionContext
): Observable<Chunk>
```

**Features:**
- Builds conversation context from history
- Handles token streaming to callbacks
- Creates assistant response chunks
- Error handling

---

### Agent Loader (`lib/agent-loader.ts`)

Automatically discovers agents from the `agents/` directory.

```typescript
// Load all agents
await loadAgents(): Promise<Map<string, AgentDefinition>>

// Reload specific agents
await reloadAgents(agentNames?: string[]): Promise<void>
```

---

### Session Store (`lib/session-store.ts`)

SQLite-based persistence for sessions.

```typescript
// Save session
await saveSession(session: AgentSessionContext): Promise<void>

// Load session
await loadSession(sessionId: string): Promise<SavedSession | null>

// List all sessions
await listSessions(): Promise<SessionMeta[]>

// Delete session
await deleteSession(sessionId: string): Promise<void>
```

---

### Scheduler (`lib/scheduler.ts`)

Cron-based scheduling for background agents.

```typescript
// Schedule a recurring task
schedule(cronExpr: string, callback: () => void | Promise<void>): () => void

// Example
const unsubscribe = session.schedule('0 7 * * *', () => {
  // Runs daily at 7:00 AM
});
```

---

### Anki Store (`lib/anki-store.ts`)

Spaced repetition flashcard storage.

```typescript
// Create a card set
createSet(name: string, description?: string): Promise<number>

// Add cards to set
addCards(setId: number, cards: { front: string, back: string }[]): Promise<void>

// Get due cards
getDueCards(setId: number): Promise<AnkiCard[]>

// Review a card
reviewCard(cardId: number, rating: 'again' | 'hard' | 'good' | 'easy'): Promise<void>
```

---

### Database (`lib/database.ts`)

SQLite database for API tokens, admin flags, and Telegram user authorization.

```typescript
// Token management
createToken(description: string, isAdmin?: boolean): Promise<string>
getToken(id: string): Promise<Token | null>
listTokens(): Promise<Token[]>
revokeToken(id: string): Promise<void>

// Telegram user trust
trustTelegramUser(id: string, username?: string, description?: string): Promise<void>
untrustTelegramUser(id: string): Promise<void>
listTelegramUsers(): Promise<TelegramUser[]>
```

---

### Ollama API (`lib/ollama-api.ts`)

Ollama LLM backend client.

```typescript
// Create evaluator
new OllamaEvaluator(model: string, params?: LLMParams): AgentEvaluator

// Streaming generation
evaluateChunk(chunk: Chunk): AsyncGenerator<Chunk>

// Abort current generation
abort(): Promise<void>
```

---

### Kobold API (`lib/kobold-api.ts`)

KoboldCPP LLM backend client.

```typescript
// Create evaluator
new KoboldEvaluator(model: string, params?: LLMParams): AgentEvaluator

// Streaming generation
evaluateChunk(chunk: Chunk): AsyncGenerator<Chunk>

// Abort current generation
abort(): Promise<void>
```

---

## See Also

- [Agents](./hosted-agents.md) - Using agents in applications
- [Evaluators](./evaluators.md) - Processing chunks
- [Tools](./tools.md) - Tool system
