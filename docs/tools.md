# Tools

Tools allow LLMs to perform actions and return results during a conversation. The tool system uses a detection-execution pipeline pattern.

## Overview

Tools are implemented in two parts:

1. **Tool Call Detector** - Parses LLM output for tool call patterns
2. **Tool Executor** - Executes detected tool calls and returns results

## Tool Call Format

LLMs trigger tool calls using a special XML-like format:

```
<|tool_call|>{"name":"toolName","parameters":{...}}<|tool_call_end|>
```

### Format Specification

| Component | Description |
|-----------|-------------|
| `<|tool_call|>` | Opening delimiter |
| `{"name":"...", "parameters":{...}}` | JSON object with tool name and parameters |
| `<|tool_call_end|>` | Closing delimiter |

## Using Tools in Agents

### Specifying Tool Set

Agents can specify which tools are available:

```typescript
import { executeTools, getToolsSystemPrompt } from '../evaluators/tool-executor.js';

// Get system prompt for specific tools
session.systemPrompt = getToolsSystemPrompt(['bash', 'webSearch']);

// Execute with specific tools
mergeMap(executeTools({ tools: ['bash', 'webSearch'] })),
```

### Available Tool Names

- `rollDice` - Dice rolling
- `bash` - Shell commands
- `readFile` - Read files
- `writeFile` - Write files
- `updateFile` - Append/search-replace files
- `listDirectory` - Directory listing
- `glob` - File glob patterns
- `webSearch` - Web search
- `webFetch` - Fetch web pages
- `knowledgeWrite` - Store knowledge
- `knowledgeRetrieve` - Retrieve knowledge
- `knowledgeSearch` - Search knowledge
- `knowledgeList` - List knowledge entries

## Available Tools

### rollDice

Rolls virtual dice using standard dice notation.

**Parameters:**
- `expression` (string): Die roll expression

**Expression Format:**
```
[count]d[sides][+|-modifier]
```

**Examples:**

| Expression | Description |
|------------|-------------|
| `1d6` | Roll 1 six-sided die |
| `2d10+3` | Roll 2 ten-sided dice, add 3 |
| `3d8-2` | Roll 3 eight-sided dice, subtract 2 |
| `4d6` | Roll 4 six-sided dice |

**Usage:**
```
<|tool_call|>{"name":"rollDice","parameters":{"expression":"2d6+1"}}<|tool_call_end|>
```

**Result:**
```
2d6+1: 4 + 6 + 1 = 11
```

---

### bash

Executes bash shell commands.

**Parameters:**
- `command` (string): The bash command to execute (required)
- `timeout` (number): Maximum execution time in ms (default: 30000)

**Usage:**
```
<|tool_call|>{"name":"bash","parameters":{"command":"ls -la"}}<|tool_call_end|>
```

**Notes:**
- Runs in a bash shell with the same environment as the server
- stdout and stderr are captured and returned
- Commands that take longer than timeout will be killed

---

### readFile

Reads the contents of a file.

**Parameters:**
- `path` (string): Absolute or relative path to the file (required)

**Usage:**
```
<|tool_call|>{"name":"readFile","parameters":{"path":"/path/to/file.txt"}}<|tool_call_end|>
```

---

### writeFile

Writes content to a file (overwrites existing).

**Parameters:**
- `path` (string): Path to the file (required)
- `content` (string): Content to write (required)

**Usage:**
```
<|tool_call|>{"name":"writeFile","parameters":{"path":"output.txt","content":"Hello world"}}<|tool_call_end|>
```

---

### updateFile

Updates a file by writing, appending, or search-replace.

**Parameters:**
- `path` (string): Path to the file (required)
- `content` (string): Content to write (for write/append)
- `append` (boolean): Append instead of overwrite
- `search` (string): Text to search for (for replace)
- `replace` (string): Text to replace with (for replace)

**Operations:**
1. Write: Provide `content`
2. Append: Provide `content` + `append: true`
3. Search-Replace: Provide `search` + `replace`

**Usage:**
```
<|tool_call|>{"name":"updateFile","parameters":{"path":"log.txt","content":"new line\n","append":true}}<|tool_call_end|>
<|tool_call|>{"name":"updateFile","parameters":{"path":"config.json","search":"old","replace":"new"}}<|tool_call_end|>
```

---

### listDirectory

Lists files and directories in a path.

**Parameters:**
- `path` (string): Directory path to list (required)

**Usage:**
```
<|tool_call|>{"name":"listDirectory","parameters":{"path":"/home/user/projects"}}<|tool_call_end|>
```

---

### glob

Searches for files matching a glob pattern.

**Parameters:**
- `pattern` (string): Glob pattern (e.g., `*.ts`, `src/**/*.js`)
- `cwd` (string): Base directory (optional, default: current dir)

**Glob Patterns:**
- `*` - Any characters except `/`
- `**` - Any characters including `/`
- `?` - Single character
- `[abc]` - Character class

**Usage:**
```
<|tool_call|>{"name":"glob","parameters":{"pattern":"**/*.ts","cwd":"/home/user/project"}}<|tool_call_end|>
```

---

### webSearch

Searches the web using Brave Search (default) or Exa AI.

**Parameters:**
- `query` (string): Search query (required)
- `numResults` (number): Number of results (default: 5)

**Environment Variables:**
- `BRAVE_API_KEY` - Brave Search API (free, recommended)
- `EXA_API_KEY` - Exa AI API

**Usage:**
```
<|tool_call|>{"name":"webSearch","parameters":{"query":"latest AI news 2026"}}<|tool_call_end|>
```

**Notes:**
- Uses Brave Search by default if `BRAVE_API_KEY` is set
- Falls back to Exa AI if Brave key not available
- Get Brave API key at: https://brave.com/search/api/

---

### webFetch

Fetches and extracts text from a web page.

**Parameters:**
- `url` (string): URL to fetch (required)
- `maxLength` (number): Max characters (default: 10000)

**Usage:**
```
<|tool_call|>{"name":"webFetch","parameters":{"url":"https://example.com","maxLength":5000}}<|tool_call_end|>
```

---

### knowledgeWrite

Stores information in the local knowledgebase.

**Parameters:**
- `content` (string): Information to store (required)
- `metadata` (object): Optional metadata (e.g., `{"tags": ["important"]}`)

**Usage:**
```
<|tool_call|>{"name":"knowledgeWrite","parameters":{"content":"The capital of France is Paris","metadata":{"tags":["geography"]}}}<|tool_call_end|>
```

---

### knowledgeRetrieve

Retrieves a knowledgebase entry by ID.

**Parameters:**
- `id` (number): Entry ID to retrieve (required)

**Usage:**
```
<|tool_call|>{"name":"knowledgeRetrieve","parameters":{"id":1}}<|tool_call_end|>
```

---

### knowledgeSearch

Searches the knowledgebase for matching entries.

**Parameters:**
- `query` (string): Search query (required)
- `limit` (number): Max results (default: 10)

**Usage:**
```
<|tool_call|>{"name":"knowledgeSearch","parameters":{"query":"capital cities","limit":5}}<|tool_call_end|>
```

---

### knowledgeList

Lists all knowledgebase entries.

**Parameters:**
- `limit` (number): Max entries (default: 50)
- `offset` (number): Entries to skip (default: 0)

**Usage:**
```
<|tool_call|>{"name":"knowledgeList","parameters":{"limit":20,"offset":0}}<|tool_call_end|>
```

---

### weather (getWeather)

Fetches current weather and 7-day forecast from Open-Meteo API (free, no API key required).

**Parameters:**
- `latitude` (number): Latitude of the location (required)
- `longitude` (number): Longitude of the location (required)
- `timezone` (string): Timezone (optional, default: "auto")

**Usage:**
```
<|tool_call|>{"name":"getWeather","parameters":{"latitude":59.3345,"longitude":18.0632,"timezone":"Europe/Stockholm"}}<|tool_call_end|>
```

**Returns:**
- Current temperature, wind speed, weather condition code
- 7-day forecast with max/min temperatures
- Weather codes mapped to descriptions

**Example Cities:**
| City | Latitude | Longitude |
|------|----------|-----------|
| Stockholm | 59.3345 | 18.0632 |
| New York | 40.7128 | -74.0060 |
| London | 51.5074 | -0.1278 |
| Tokyo | 35.6762 | 139.6503 |
| Sydney | -33.8688 | 151.2093 |

---

### git

Executes git commands and returns structured results with syntax highlighting.

**Parameters:**
- `command` (string): Git command to execute (required)
- `cwd` (string): Working directory (optional, default: server root)

**Usage:**
```
<|tool_call|>{"name":"git","parameters":{"command":"status"}}<|tool_call_end|>
<|tool_call|>{"name":"git","parameters":{"command":"log --oneline -5"}}<|tool_call_end|>
<|tool_call|>{"name":"git","parameters":{"command":"diff HEAD~1","cwd":"/path/to/repo"}}<|tool_call_end|>
```

**Supported Operations:**
- `status` - Repository status with staged/unstaged changes
- `log` - Commit history
- `diff` - File changes with visual diff output
- `show` - File contents at specific commits
- `branch` - Branch operations

---

### sheetbot

SheetBot is a distributed task execution system. This tool provides operations for managing tasks.

**Parameters:**
- `operation` (string): Operation to perform (required)
- Additional parameters vary by operation

**Operations:**

| Operation | Description |
|-----------|-------------|
| `list_sheets` | List all available sheets |
| `get_sheet` | Get sheet contents by name |
| `list_tasks` | List all tasks |
| `get_task` | Get task details by ID |
| `create_task` | Create a new task |
| `delete_task` | Delete a task by ID |
| `list_agents` | List active agents |
| `list_library` | List script library |

**Usage:**
```
<|tool_call|>{"name":"sheetbot","parameters":{"operation":"list_tasks"}}<|tool_call_end|>
<|tool_call|>{"name":"sheetbot","parameters":{"operation":"create_task","name":"my-task","script":"console.log('hello')","type":"deno"}}<|tool_call_end|>
```

---

## Adding New Tools

1. Create a new file in `tools/` implementing a tool class with `name`, `systemPrompt`, and `execute()` method
2. Import and add the tool to `ALL_TOOLS` map in `evaluators/tool-executor.ts`

### Tool Class Template

```typescript
export class MyTool {
  readonly name = 'myTool';
  readonly systemPrompt = MY_TOOL_SYSTEM_PROMPT;

  execute(parameters: MyParams): MyResult {
    // Tool implementation
    return { ... };
  }
}

export const MY_TOOL_SYSTEM_PROMPT = `
Tool: myTool
Description: What the tool does
Parameters:
- param1: Description
`;
```

## Evaluators

### detectToolCalls()

Evaluates text chunks and detects tool call patterns. Adds `com.rxcafe.tool-detection` annotation with detected calls.

### executeTools(options?)

Executes detected tool calls and emits result chunks.

**Options:**
- `tools` (string[]): List of tool names to enable. If not specified, all tools are available.

## Annotations

See [Annotations: tool](./annotations/tool.md) for detailed annotation reference.
