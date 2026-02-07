# RXCAFE Chat

A reactive chat application built with the RXCAFE architecture pattern, using Bun.js. Supports both KoboldCPP and Ollama LLM backends with security filtering for web content.

## Features

- **RXCAFE Architecture**: Chunks, annotations, and evaluators following the RXCAFE spec
- **Multiple LLM Backends**: KoboldCPP and Ollama support
- **Telegram Bot**: Use Telegram as input/output alongside the web interface
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
   export OLLAMA_MODEL=gemma3:1b  # or any model you have pulled
   ```

3. **(Optional) Configure Telegram Bot**:
   ```bash
   export TELEGRAM_TOKEN=your_bot_token_here
   # Optional: for webhook mode instead of polling
   # export TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook/telegram
   ```
   
   To create a bot:
   1. Message [@BotFather](https://t.me/botfather) on Telegram
   2. Send `/newbot` and follow instructions
   3. Copy the token and set it as `TELEGRAM_TOKEN`

4. **Run the server**:
   ```bash
   bun run main.ts
   # or
   bun start
   ```

5. **Open the app**:
   Navigate to `http://localhost:3000`

   When creating a session, you can choose between KoboldCPP and Ollama backends in the UI.
   
   Or start chatting via Telegram by messaging your bot!

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
│   ├── ollama-api.ts      # Ollama API client & evaluator
│   └── telegram.ts        # Telegram Bot API client
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
- `OLLAMA_MODEL` - Default Ollama model (default: `gemma3:1b`)
- `PORT` - HTTP server port (default: `3000`)
- `RXCAFE_TRACE` - Set to `1` to enable detailed logging of LLM context (default: disabled)
- `TELEGRAM_TOKEN` - Telegram bot token (optional, enables Telegram bot)
- `TELEGRAM_WEBHOOK_URL` - Webhook URL for Telegram (optional, uses polling if not set)

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

## Using Telegram Bot

Once configured with `TELEGRAM_TOKEN`, the bot will:

1. **Auto-create sessions**: Each Telegram chat gets its own RXCAFE session
2. **Support all commands**:
   - `/web <URL>` - Fetch web content (with trust buttons)
   - `/help` - Show help
   - Any other message - Chat with the LLM
3. **Streaming responses**: Bot shows typing indicator and streams response
4. **Trust system**: Web content shows inline buttons to trust/untrust

**Commands in Telegram:**
- `/start` - Initialize bot and show welcome message
- `/web https://example.com` - Fetch web content
- `/help` - Show available commands

**Trusting Web Content in Telegram:**
When you fetch web content, the bot sends it with Trust/Untrust buttons:
- ✅ Click "Trust" to add to LLM context
- ❌ Click "Untrust" to keep it excluded

**Notes:**
- Each Telegram chat is isolated (separate session)
- Telegram sessions persist while the server is running
- Web content fetched via Telegram follows the same security rules as the web UI

## License

MIT
