# RXCAFE Chat

A reactive chat application built with the RXCAFE architecture pattern, using Bun.js. Supports both KoboldCPP and Ollama LLM backends with security filtering for web content.

## Features

- **RXCAFE Architecture**: Chunks, annotations, and evaluators following the RXCAFE spec
- **Multiple LLM Backends**: KoboldCPP and Ollama support
- **Streaming LLM responses**: Real-time token streaming
- **Session management**: Multiple concurrent chat sessions with backend selection
- **Web Content Fetching**: `/web URL` command with trust-based security
- **Security Filtering**: Untrusted web content is blocked from LLM context until explicitly trusted
- **Simple REST API**: JSON endpoints + Server-Sent Events for streaming
- **Web frontend**: Clean, responsive chat interface with backend selector

## Architecture

This app implements the RXCAFE pattern:

- **Chunks** (`lib/chunk.ts`): Immutable data units with content, producer ID, and annotations
- **Streams** (`lib/stream.ts`): Reactive streams that process chunks through evaluators
- **Evaluators** (`lib/kobold-api.ts`, `lib/ollama-api.ts`): LLM evaluators that transform user input into assistant responses
- **Security** (`main.ts`): Trust-based filtering prevents untrusted web content from reaching the LLM

## Setup

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Configure your LLM backend**:

   **Option A: KoboldCPP**
   ```bash
   export LLM_BACKEND=kobold
   export KOBOLD_URL=http://localhost:5001
   ```

   **Option B: Ollama**
   ```bash
   export LLM_BACKEND=ollama
   export OLLAMA_URL=http://localhost:11434
   export OLLAMA_MODEL=llama2  # or any model you have pulled
   ```

3. **Run the server**:
   ```bash
   bun run main.ts
   # or
   bun start
   ```

4. **Open the app**:
   Navigate to `http://localhost:3000`

   When creating a session, you can choose between KoboldCPP and Ollama backends in the UI.

## Slash Commands

### `/web <URL>`
Fetch content from a web page and add it as a chunk.

**Security Note**: Web content is marked as **untrusted** by default and will NOT be used as context for the LLM. You must explicitly trust the chunk before the LLM can see it.

**To trust a chunk**:
1. Click the "Trust" button on the web chunk
2. OR right-click the chunk and select "Trust Chunk"

The chunk will turn green when trusted and be included in future LLM context.

## API Endpoints

- `POST /api/session` - Create a new chat session (accepts `backend` and `model` in body)
- `GET /api/models` - List available models (Ollama only)
- `GET /api/session/:id/history` - Get session chat history
- `POST /api/session/:id/web` - Fetch web content as untrusted chunk
- `POST /api/session/:id/chunk/:chunkId/trust` - Toggle trust status for a chunk
- `POST /api/chat/:sessionId` - Send a message (returns SSE stream)
- `POST /api/chat/:sessionId/abort` - Abort ongoing generation
- `GET /api/health` - Health check

## Project Structure

```
.
├── main.ts                 # Main HTTP server with security filtering
├── lib/
│   ├── chunk.ts           # RXCAFE chunk primitives
│   ├── stream.ts          # Reactive stream utilities
│   ├── kobold-api.ts      # KoboldCPP API client & evaluator
│   └── ollama-api.ts      # Ollama API client & evaluator
├── frontend/
│   ├── index.html         # Chat UI with trust controls
│   ├── app.js             # Frontend logic with slash commands
│   └── styles.css         # Styles with web chunk theming
└── package.json
```

## Environment Variables

- `LLM_BACKEND` - Default LLM backend: `kobold` or `ollama` (default: `kobold`)
- `KOBOLD_URL` - KoboldCPP server URL (default: `http://localhost:5001`)
- `OLLAMA_URL` - Ollama server URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL` - Default Ollama model (default: `llama2`)
- `PORT` - HTTP server port (default: `3000`)
- `RXCAFE_TRACE` - Set to `1` to enable detailed logging of LLM context (default: disabled)

### Tracing

Set `RXCAFE_TRACE=1` to see exactly what content is being sent to the LLM:

```bash
RXCAFE_TRACE=1 bun start
```

This will log:
- Chunk ID and producer
- Content length
- Full content sent to LLM
- Annotations attached to the chunk

Useful for debugging what context actually reaches the LLM after trust filtering.

## Security Model

RXCAFE Chat implements the security pattern from RXCAFE spec section 4.3:

1. **Untrusted by Default**: Web content is automatically marked as untrusted when fetched
2. **Stream Filtering**: The `createTrustFilter()` evaluator filters out untrusted chunks before they reach the LLM
3. **Explicit Trust**: Users must explicitly mark content as trusted via UI
4. **Visual Indicators**: Untrusted chunks are shown with red borders, trusted chunks with green

This prevents:
- Prompt injection via malicious web pages
- Unintended data leakage to LLM providers
- Accidental inclusion of unwanted content

## Using Ollama

1. Install Ollama: https://ollama.com
2. Pull a model: `ollama pull llama2` (or any model you prefer)
3. Start Ollama: `ollama serve`
4. Run this app with `LLM_BACKEND=ollama`

## Using KoboldCPP

1. Download KoboldCPP: https://github.com/LostRuins/koboldcpp
2. Start KoboldCPP with your GGUF model
3. Run this app (KoboldCPP is the default)

## License

MIT
