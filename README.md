# RXCAFE Chat

A reactive chat application built with the RXCAFE architecture pattern, using Bun.js and KoboldCPP API.

## Features

- **RXCAFE Architecture**: Chunks, annotations, and evaluators following the RXCAFE spec
- **Streaming LLM responses**: Real-time token streaming from KoboldCPP
- **Session management**: Multiple concurrent chat sessions
- **Simple REST API**: JSON endpoints + Server-Sent Events for streaming
- **Web frontend**: Clean, responsive chat interface

## Architecture

This app implements the RXCAFE pattern:

- **Chunks** (`lib/chunk.ts`): Immutable data units with content, producer ID, and annotations
- **Streams** (`lib/stream.ts`): Reactive streams that process chunks through evaluators
- **Evaluators** (`lib/kobold-api.ts`): LLM evaluators that transform user input into assistant responses

## Setup

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Configure KoboldCPP**:
   Set the `KOBOLD_URL` environment variable (defaults to `http://localhost:5001`):
   ```bash
   export KOBOLD_URL=http://localhost:5001
   ```

3. **Run the server**:
   ```bash
   bun run main.ts
   # or
   bun start
   ```

4. **Open the app**:
   Navigate to `http://localhost:3000`

## API Endpoints

- `POST /api/session` - Create a new chat session
- `GET /api/session/:id/history` - Get session chat history
- `POST /api/chat/:sessionId` - Send a message (returns SSE stream)
- `POST /api/chat/:sessionId/abort` - Abort ongoing generation
- `GET /api/health` - Health check

## Project Structure

```
.
├── main.ts                 # Main HTTP server
├── lib/
│   ├── chunk.ts           # RXCAFE chunk primitives
│   ├── stream.ts          # Reactive stream utilities
│   └── kobold-api.ts      # KoboldCPP API client & evaluator
├── frontend/
│   ├── index.html         # Chat UI
│   ├── app.js             # Frontend logic
│   └── styles.css         # Styles
└── package.json
```

## Environment Variables

- `KOBOLD_URL` - KoboldCPP server URL (default: `http://localhost:5001`)
- `PORT` - HTTP server port (default: `3000`)

## License

MIT
