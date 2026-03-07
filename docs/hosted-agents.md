# Hosted Agents

Hosted agents are the original agent type in ObservableCAFE. They are embedded in the runtime and run as part of the server process.

## Characteristics

- **Embedded**: Hosted agents run within the server process.
- **Session-bound**: Each session has exactly one hosted agent (either interactive or background).
- **Pipeline-based**: They define RxJS pipelines that process chunks from the input stream and emit to the output stream.
- **Auto-discovery**: Hosted agents are automatically discovered from the `agents/` directory (or custom paths via `ObservableCAFE_AGENT_SEARCH_PATHS`).

## Available Agents

### Default Agent

The standard chat agent that provides conversational AI capabilities using LLM backends.

```typescript
// Agent ID: "default"
```

### Agent Factory

Creates new ObservableCAFE agents using natural language descriptions with automatic TypeScript validation.

**Commands:**
- `!help` - Show available commands
- `!create <name> <description>` - Create a new agent from description
- `!create-with-prompt <name>` - Interactive creation with custom system prompt
- `!validate <typescript code>` - Validate code without saving
- `!list` - List all generated agents
- `!show <name>` - Display agent source code
- `!edit <name> <instructions>` - Edit an existing agent
- `!delete <name>` - Delete a generated agent

**Example:**
```
!create weather-agent An agent that fetches weather data from the open-meteo.com api
```

The agent generates TypeScript code, validates it using Bun's TypeScript compiler, and automatically retries with fixes if errors occur.

---

### Chess Agent

Play chess against an AI with full move validation.

**Commands:**
- `!new` / `!reset` - Start a new game
- `!board` / `!position` - Show current board
- `!moves` / `!history` - Show move history
- `!help` / `!commands` - Show available commands

**Supported UI Modes:** `chat`, `game-chess`

The agent includes:
- Full chess rules implementation (castling, en passant, promotion)
- Check/checkmate detection
- Simple AI opponent using piece evaluation

---

### Demonstration Agent

Showcases all supported chat widgets and content types including:
- Text messages with markdown
- Code blocks with syntax highlighting
- Diff views
- Dice rolls
- Tool calls
- Web content
- Quick response buttons
- System prompts
- Pipeline visualization (Rx marbles)
- Sentiment analysis
- Images (binary)
- Audio (binary)
- Files (binary)
- Weather widget
- Vega graphs (bar & pie charts)

---

### Filesystem Agent

File operations via LLM with tools for reading, writing, updating, listing, and globbing files.

**Tools Available:**
- `readFile` - Read file contents
- `writeFile` - Write/overwrite files
- `updateFile` - Append or search-replace
- `listDirectory` - List directory contents
- `glob` - Search files with glob patterns

---

### Git Agent

Git operations with code and diff visualization support.

**Commands:**
- `git show <file>` / `show <file>` - Display file content with syntax highlighting
- `git show <ref>:<path>` - Show file from specific commit
- `git diff` / `diff` - Show working directory changes
- `git diff <commit>` - Show changes in a commit
- `git status` / `status` - Show repository status
- `git log` / `log` - Show commit history

**Features:**
- Syntax highlighting for code display
- Visual diff widgets with added/removed highlighting
- Branch information

---

### Quiz Agent

A fun quiz game with multiple choice questions using quick response buttons.

**Commands:**
- `start quiz` - Start a new quiz
- `score` - View current score
- `help` - Show available commands

**Features:**
- Multiple choice questions
- Quick response buttons for answers
- Score tracking
- Explanation after each answer

**Supported UI Modes:** `chat`, `game-quiz`

---

### Weather Agent

Weather forecast agent using Open-Meteo API (free, no API key needed).

**Features:**
- Current weather conditions
- 7-day forecast
- Wind information
- Location-based (latitude/longitude)

**Example cities:**
- Stockholm: 59.3345, 18.0632
- New York: 40.7128, -74.0060
- London: 51.5074, -0.1278
- Tokyo: 35.6762, 139.6503
- Sydney: -33.8688, 151.2093

The agent uses the `getWeather` tool to fetch data and presents it with a weather widget.

---

### SheetBot Agent

Create and manage SheetBot tasks via natural language. SheetBot is a distributed task execution system.

**Commands:**
- `!tasks` - List all tasks
- `!tasks <status>` - Filter by status (0-4)
- `!sheets` - List all sheets
- `!agents` - List active agents
- `!library` - List script library
- `!help` - Show available commands

**Task Statuses:**
| # | Status | Description |
|--:|--------|-------------|
| 0 | AWAITING | Ready for execution |
| 1 | RUNNING | Currently being executed |
| 2 | COMPLETED | Finished successfully |
| 3 | FAILED | Finished with error |
| 4 | PAUSED | Not ready for execution |

---

### Image Agent

Chat agent with image generation via ComfyUI.

**Features:**
- Regular chat when not requesting images
- Detects image requests (words like "generate", "draw", "paint")
- Routes to ComfyUI for image generation

**Configuration:**
```json
{
  "config.comfyui": {
    "host": "localhost",
    "port": 8188,
    "outputFolder": "generated/images"
  }
}
```

---

### Image Painter Agent

Generates random 64x64 pixel art images (BMP format) in response to messages.

**Features:**
- No LLM required
- Generates random colorful BMP images
- Simple demonstration of binary chunk output

---

### Voice Agent

Chat agent with voice TTS (Text-to-Speech) generation for markdown text.

**Features:**
- Processes LLM responses through markdown parser
- Generates audio from text using TTS endpoint
- Supports different voices for different content types

**Configuration:**
```json
{
  "config.voice": {
    "voices": { "text": "Robert.wav", "quote": "Robert.wav" },
    "generation": { "temperature": 0.8 },
    "ttsEndpoint": "http://localhost:8000/tts"
  }
}
```

---

### Voice Chat Agent

Chat agent that accepts both text and audio input. Audio is transcribed and processed by LLM.

**Features:**
- Accepts audio (WAV, WebM, OGG, etc.)
- Auto-converts to MP3 for compatibility
- Transcribes using Handy (local speech-to-text)
- Processes transcribed text through LLM

**Configuration:**
```json
{
  "handyConfig": {
    "baseUrl": "http://localhost:5500",
    "responseFormat": "json"
  }
}
```

---

### Bash Agent

Execute bash shell commands via LLM.

**Features:**
- Uses `bash` tool for command execution
- Captures stdout and stderr
- Configurable timeout

---

### Handy Transcriber Agent

Speech-to-text transcription agent using Handy (local Whisper/Parakeet API).

**Features:**
- Accepts audio input
- Returns transcribed text
- Runs as standalone transcription service

---

### RSS Summarizer (Background Agent)

Fetches and summarizes RSS feeds on a schedule (default: daily at 07:00).

**Configuration:**
```json
{
  "rss": {
    "feeds": ["https://news.ycombinator.com/rss"]
  }
}
```

**Features:**
- Background agent (starts on server boot)
- Scheduled fetching using cron
- LLM-powered summarization

---

### Time Ticker (Background Agent)

Periodically outputs the current time.

**Features:**
- Background agent
- Configurable interval
- Simple demonstration of scheduled agents

---

### Anki Agent

Flashcard study with spaced repetition using SQLite persistence.

**Commands:**
- `!sets` - List all card sets
- `!set create <name>` - Create new card set
- `!import <setName> <front,back>` - Add cards
- `!study [setName]` - Start studying
- `!show` - Reveal answer
- `!again` / `!hard` / `!good` / `!easy` - Rate card

See [Anki Documentation](./annotations/anki.md) for details.

---

## Background Agents

Background agents start automatically when the server boots. They are useful for:

- Periodic tasks (e.g., RSS fetching, time reporting)
- Long-running computations
- Event-driven processing

### Starting in Background

To start an agent in background, set `startInBackground: true` in the agent definition:

```typescript
export const myAgent: AgentDefinition = {
  name: 'my-agent',
  startInBackground: true,
  // ...
};
```

## Session Association

A session is always created with a hosted agent:

```
Session = {
  id: string,
  agentName: string,    // The hosted agent ID
  isBackground: boolean,
  inputStream: Subject<Chunk>,
  outputStream: Subject<Chunk>,
  ...
}
```

- **Interactive agents**: Created on-demand via the UI or API. They process user messages.
- **Background agents**: Start automatically on server boot.

## Creating a Session with a Hosted Agent

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "agentId": "default",
    "backend": "ollama",
    "model": "gemma3:1b"
  }'
```

## Agent Reloading

Agents can be reloaded at runtime using the System agent (`!reload` command).

### allowsReload

By default, agents can be reloaded. To prevent reloading (useful for agents with in-memory state):

```typescript
export const myStatefulAgent: AgentDefinition = {
  name: 'my-stateful-agent',
  allowsReload: false,  // Existing sessions keep old code
  // ...
};
```

When `allowsReload: false`:
- Existing sessions continue using the old agent code (preserving state)
- New sessions use the updated code

## Supported UI Modes

Some agents support custom UI modes:

| Agent | UI Modes |
|-------|----------|
| chess | chat, game-chess |
| quiz | chat, game-quiz |
| default | chat |
| dice | chat, game-dice |

---

## See Also

- [Connected Agents](./connected-agents.md) - External agents connecting via API
- [Agent Development](../agents/) - Creating custom agents
- [Tools](./tools.md) - Tool system for agent actions
