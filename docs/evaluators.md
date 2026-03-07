# Evaluators

Evaluators are modular components that encapsulate specialized logic for processing chunks. They are used by agents to perform specific tasks like sentiment analysis, tool execution, or data transformation.

## Overview

Evaluators follow the higher-order function pattern - they take a session context and return an RxJS operator that processes chunks:

```typescript
export function analyzeSentiment(session: AgentSessionContext) {
  return (chunk: Chunk): Observable<Chunk> => {
    // Implementation
  };
}
```

## Available Evaluators

### Sentiment Analyzer

Analyzes the sentiment of text chunks using LLM.

**Location:** `evaluators/sentiment.ts`

**Usage:**
```typescript
import { analyzeSentiment } from '../evaluators/sentiment.js';

session.inputStream.pipe(
  filter(c => c.contentType === 'text'),
  mergeMap(analyzeSentiment(session)),
).subscribe(chunk => {
  // chunk.annotations['com.rxcafe.example.sentiment'] contains:
  // { score: number, explanation: string }
});
```

**Output Annotation:** `com.rxcafe.example.sentiment`
- `score`: Number from -1.0 to 1.0 (-1 = negative, 0 = neutral, 1 = positive)
- `explanation`: Brief explanation of the sentiment

---

### RSS Processor

Fetches and summarizes RSS feeds.

**Location:** `evaluators/rss-processor.ts`

**Functions:**

#### fetchRss(url: string): Promise<RssItem[]>

Fetches and parses an RSS feed.

```typescript
import { fetchRss } from '../evaluators/rss-processor.ts';

const items = await fetchRss('https://news.ycombinator.com/rss');
// Returns: { title: string, link: string, description: string }[]
```

#### summarizeRss(session: AgentSessionContext)

Higher-order function that returns an async function to summarize RSS feeds.

```typescript
import { summarizeRss } from '../evaluators/rss-processor.ts';

const summarize = summarizeRss(session);
const summary = await summarize('https://news.ycombinator.com/rss');
```

---

### Tool Call Detector

Detects tool call patterns in LLM output.

**Location:** `evaluators/tool-call-detector.ts`

**Function:** `detectToolCalls()`

Detects tool calls in text chunks using the `<|tool_call|>...<|tool_call_end|>` format.

```typescript
import { detectToolCalls } from '../evaluators/tool-call-detector.ts';

chunk.pipe(
  detectToolCalls()
).subscribe(chunk => {
  // chunk.annotations['com.rxcafe.tool-detection'] contains:
  // { hasToolCalls: boolean, toolCalls: { name: string, args: any }[] }
});
```

**Output Annotation:** `com.rxcafe.tool-detection`

---

### Tool Executor

Executes detected tool calls and returns results.

**Location:** `evaluators/tool-executor.ts`

**Functions:**

#### executeTools(options?)

Executes detected tool calls.

```typescript
import { executeTools } from '../evaluators/tool-executor.ts';

chunk.pipe(
  executeTools({ tools: ['bash', 'rollDice'] })
).subscribe(chunk => {
  // Tool results are in chunk.annotations['tool.results']
});
```

**Options:**
- `tools` (string[]): List of tool names to enable. If not specified, all tools are available.

#### getToolsSystemPrompt(tools: string[]): string

Returns a system prompt fragment describing the specified tools.

```typescript
import { getToolsSystemPrompt } from '../evaluators/tool-executor.ts';

session.systemPrompt = `You can use tools.\n${getToolsSystemPrompt(['bash', 'webSearch'])}`;
```

---

### Handy Transcriber

Transcribes audio to text using Handy (local speech-to-text service).

**Location:** `evaluators/handy-transcriber.ts`

**Function:** `transcribeToUserChunk(session, config?)`

Returns an operator that converts audio chunks to user text chunks.

```typescript
import { transcribeToUserChunk } from '../evaluators/handy-transcriber.ts';

const transcriber = transcribeToUserChunk(session, {
  baseUrl: 'http://localhost:5500',
  responseFormat: 'json'
});

session.inputStream.pipe(
  mergeMap(transcriber)
).subscribe(chunk => {
  // Audio is now transcribed to text with chat.role=user
});
```

**Configuration:**
- `baseUrl`: Handy server URL (default: http://localhost:5500)
- `responseFormat`: 'json' or 'verbose_json' (default: 'json')

---

### Audio Converter

Converts audio between formats.

**Location:** `evaluators/audio-converter.ts`

**Function:** `convertToMp3(options)`

Returns an operator that converts audio to MP3 format.

```typescript
import { convertToMp3 } from '../evaluators/audio-converter.ts';

const converter = convertToMp3({
  targetFormat: 'mp3',
  targetMimeType: 'audio/mpeg'
});

session.inputStream.pipe(
  mergeMap(converter)
).subscribe(chunk => {
  // Audio is now in MP3 format
});
```

---

### Image Generator

Generates images using ComfyUI.

**Location:** `evaluators/image-generator.ts`

**Function:** `generateImage(session)`

Higher-order function that returns an operator for image generation.

```typescript
import { generateImage } from '../evaluators/image-generator.ts';

session.inputStream.pipe(
  generateImage(session)
).subscribe(chunk => {
  // chunk is a binary image chunk
});
```

**Configuration (via null chunk):**
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

### Markdown Voice Parser

Parses markdown text for voice/TTS output.

**Location:** `evaluators/markdown-voice-parser.ts`

**Function:** `parseMarkdownForVoice(session)`

Returns an operator that parses markdown and annotates chunks for voice output.

```typescript
import { parseMarkdownForVoice } from '../evaluators/markdown-voice-parser.ts';

session.inputStream.pipe(
  parseMarkdownForVoice(session)
).subscribe(chunk => {
  // chunk.annotations contains voice-specific annotations
});
```

**Features:**
- Detects code blocks
- Identifies quotes
- Marks text for different voice profiles

---

### Voice Generator

Generates TTS audio from text.

**Location:** `evaluators/voice.ts`

**Function:** `generateVoice(session)`

Returns an operator that generates audio from text chunks.

```typescript
import { generateVoice } from '../evaluators/voice.ts';

session.inputStream.pipe(
  generateVoice(session)
).subscribe(chunk => {
  // chunk is a binary audio chunk
});
```

**Configuration (via null chunk):**
```json
{
  "config.voice": {
    "voices": { "text": "Robert.wav", "quote": "Robert.wav" },
    "ttsEndpoint": "http://localhost:8000/tts"
  }
}
```

---

## Creating Custom Evaluators

### Pattern

Evaluators are higher-order functions that take a session context and return an RxJS operator:

```typescript
import type { AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { Observable } from '../lib/stream.js';

export function myEvaluator(session: AgentSessionContext) {
  // Optionally create evaluator with specific settings
  const evaluator = session.createLLMChunkEvaluator({
    temperature: 0,
    maxTokens: 100
  });

  return (chunk: Chunk): Observable<Chunk> => {
    return new Observable(subscriber => {
      // Process the chunk
      // ...

      // Emit to output stream (for history)
      session.outputStream.next(processedChunk);

      // Pass to subscriber (for pipeline)
      subscriber.next(processedChunk);
      subscriber.complete();
    });
  };
}
```

### Usage in Agents

```typescript
import { myEvaluator } from '../evaluators/my-evaluator.js';

session.inputStream.pipe(
  filter(c => c.contentType === 'text'),
  mergeMap(myEvaluator(session)),
  // Continue pipeline...
).subscribe(chunk => {
  session.outputStream.next(chunk);
});
```

---

## See Also

- [Tools](./tools.md) - Tool system for agent actions
- [Agents](./hosted-agents.md) - Hosted agents that use evaluators
