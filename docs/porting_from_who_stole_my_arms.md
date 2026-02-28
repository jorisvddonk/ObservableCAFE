# Porting from Who Stole My Arms to ObservableCAFE

This document guides developers through porting agents and evaluators from the Who Stole My Arms (WSMA) codebase to ObservableCAFE.

## Architectural Overview

| Aspect | WSMA | ObservableCAFE |
|--------|------|-------|
| Agent Pattern | Class extending `LLMAgent` | `AgentDefinition` interface |
| Pipeline | Direct stream processing | RxJS operators (`filter`, `map`, `mergeMap`) |
| Evaluator Pattern | Class extending `Evaluator` | Higher-order functions returning RxJS operators |
| Config | Tool/settings classes | Runtime config via null chunks |
| Output | Various emitters | `session.outputStream.next(chunk)` |

## Key Concepts

### Agents

In WSMA, agents extend `LLMAgent` and implement methods like `run(task)`.

In ObservableCAFE, agents are objects implementing `AgentDefinition`:

```typescript
interface AgentDefinition {
  name: string;
  description?: string;
  configSchema?: Record<string, any>;
  initialize(session: AgentSessionContext): void;
  destroy?(session: AgentSessionContext): void;
}
```

The agent builds an RxJS pipeline in `initialize()` that processes chunks from `inputStream` and emits to `outputStream`.

### Evaluators

In WSMA, evaluators are classes that implement `Evaluator` interface with `evaluate(chunk, arena)`.

In ObservableCAFE, evaluators are higher-order functions that return RxJS operators:

```typescript
// WSMA
class MyEvaluator extends Evaluator {
  async evaluate(chunk: Chunk): Promise<{ annotation?: any }> { ... }
}

// ObservableCAFE
export function myEvaluator(session: AgentSessionContext) {
  return (source: Observable<Chunk>): Observable<Chunk> => {
    return new Observable(subscriber => {
      const subscription = source.subscribe({
        next: async (chunk: Chunk) => {
          // Process chunk
          subscriber.next(chunk);
        }
      });
      return () => subscription.unsubscribe();
    });
  };
}
```

### Runtime Configuration

WSMA uses tool classes and JSON config files:

```typescript
// WSMA
const settingsData = readFileSync('./voice-settings.json', 'utf-8');
this.voiceSettings = JSON.parse(settingsData);
```

ObservableCAFE uses runtime config via null chunks:

```typescript
// ObservableCAFE
// Send null chunk to configure:
{
  "contentType": "null",
  "annotations": {
    "config.type": "runtime",
    "config.voice": { /* config */ }
  }
}

// Access in evaluator/agent:
const runtimeConfig = session.config.sessionConfig || {};
const config = runtimeConfig['config.voice'] || DEFAULT_CONFIG;
```

### Output

WSMA uses various emitters for different outputs (voice, images, events).

ObservableCAFE uses a unified pattern - emit chunks to `outputStream`:

```typescript
// Text chunk
session.outputStream.next(createTextChunk(
  'Hello',
  'my-agent',
  { 'chat.role': 'assistant' }
));

// Binary chunk (images, audio)
session.outputStream.next(createBinaryChunk(
  imageData,
  'image/png',
  'my-agent',
  { 'image.file': 'image.png' }
));
```

## Ported Components

### Voice Evaluator

**WSMA:** `lib/evaluators/VoiceEvaluator.ts` + `lib/markdown-parser.ts`
**ObservableCAFE:** `evaluators/voice.ts` + `evaluators/markdown-voice-parser.ts`

Usage:

```typescript
import { parseMarkdownForVoice } from '../evaluators/markdown-voice-parser.js';
import { generateVoice } from '../evaluators/voice.js';

initialize(session: AgentSessionContext) {
  session.inputStream.pipe(
    parseMarkdownForVoice(session),
    generateVoice(session)
  ).subscribe(chunk => session.outputStream.next(chunk));
}
```

Runtime config:

```json
{
  "contentType": "null",
  "annotations": {
    "config.type": "runtime",
    "config.voice": {
      "voices": { "text": "Robert.wav", "quote": "Robert.wav" },
      "generation": { "temperature": 0.8 },
      "ttsEndpoint": "http://localhost:8000/tts"
    }
  }
}
```

### Image Generator

**WSMA:** `lib/agents/ImageGenerationAgent.ts` + `lib/tools/GenerateImageTool.ts`
**ObservableCAFE:** `evaluators/image-generator.ts`

Usage:

```typescript
import { generateImage } from '../evaluators/image-generator.js';

initialize(session: AgentSessionContext) {
  session.inputStream.pipe(
    generateImage(session)
  ).subscribe(chunk => session.outputStream.next(chunk));
}
```

Runtime config:

```json
{
  "contentType": "null",
  "annotations": {
    "config.type": "runtime",
    "config.comfyui": {
      "host": "localhost",
      "port": 8188,
      "outputFolder": "generated/images"
    }
  }
}
```

## Common Patterns

### Filtering Chunks

```typescript
// Filter for user messages only
filter((chunk: Chunk) => chunk.annotations['chat.role'] === 'user')

// Filter for text chunks only
filter((chunk: Chunk) => chunk.contentType === 'text')

// Trust filtering
filter((chunk: Chunk) => {
  const trustLevel = chunk.annotations['security.trust-level'];
  return !trustLevel || trustLevel.trusted !== false;
})
```

### Adding Annotations

```typescript
import { annotateChunk } from '../lib/chunk.js';

const annotated = annotateChunk(chunk, 'my.annotation', { key: 'value' });
```

### Creating Chunks

```typescript
import { createTextChunk, createBinaryChunk, createNullChunk } from '../lib/chunk.js';

createTextChunk('Hello', 'my-agent', { 'chat.role': 'assistant' });
createBinaryChunk(imageData, 'image/png', 'my-agent', { 'image.width': 512 });
createNullChunk('my-agent', { 'config.type': 'runtime', 'config.key': 'value' });
```

### Using LLM in Evaluators

```typescript
async function callLLM(session: AgentSessionContext, prompt: string): Promise<string> {
  const evaluator = session.createLLMChunkEvaluator();
  
  const promptChunk: Chunk = {
    id: `prompt-${Date.now()}`,
    timestamp: Date.now(),
    contentType: 'text',
    content: prompt,
    producer: 'my-agent',
    annotations: {}
  };

  let fullResponse = '';
  for await (const tokenChunk of evaluator.evaluateChunk(promptChunk)) {
    if (tokenChunk.content && typeof tokenChunk.content === 'string') {
      fullResponse += tokenChunk.content;
    }
  }
  return fullResponse.trim();
}
```

### Waiting for Async Operations

WSMA often uses promises:

```typescript
// WSMA
await this.waitForVoiceProcessing();
```

ObservableCAFE uses RxJS operators:

```typescript
// Use concatMap for sequential processing
mergeMap(async (chunk) => {
  await asyncOperation();
  return chunk;
})
```

## Annotation Keys

When porting, use consistent annotation naming:

| Purpose | Key Format | Example |
|---------|------------|---------|
| Runtime config | `config.*` | `config.voice`, `config.comfyui` |
| Parsed content | `{domain}.parsed` | `voice.parsed`, `parsers.markdown.parsed` |
| Generated content | `{domain}.generated` | `voice.generated`, `image.generated` |
| Content metadata | `{domain}.*` | `voice.text`, `image.file` |

## File Structure

WSMA:

```
lib/
  agents/
    MyAgent.ts
  evaluators/
    MyEvaluator.ts
  tools/
    MyTool.ts
interfaces/
  MyInterface.ts
```

ObservableCAFE:

```
agents/
  my-agent.ts
evaluators/
  my-evaluator.ts
lib/
  my-util.ts
```

## Testing

Run the server:

```bash
bun start
```

Create a session with your agent:

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"agentId": "my-agent", "backend": "ollama", "model": "gemma3:1b"}'
```

Send messages via WebSocket or HTTP.
