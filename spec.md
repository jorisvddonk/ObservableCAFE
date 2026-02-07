RXCAFE: A Reactive Architecture for Chunk-Based Evaluation Pipelines
====================================================================

Version 2.0

1. Overview
-----------

RXCAFE is an architectural pattern for building systems where data flows through reactive streams as discrete units called _chunks_, processed by composable functions called _evaluators_. It is designed to support LLM-assisted applications, build systems, media processing pipelines, and data analysis workflows using a unified set of primitives.

RXCAFE is built on three key insights:

1. **Reactive composition enables complex behavior from simple parts.** By expressing all routing, sequencing, and parallelism through standard reactive stream operators, systems remain comprehensible and debuggable.

2. **Annotations enable multi-stage processing without context bloat.** Metadata and derived information attach to chunks as they flow, allowing downstream evaluators to consume structured interpretations rather than reprocessing raw content.

3. **Leveraging well-known primitives maximizes both human and LLM productivity.** By building on Reactive Extensions patterns already present in LLM training data, systems can be designed, debugged, and extended by both developers and AI coding assistants with minimal learning overhead.

RXCAFE does not prescribe a specific implementation or runtime. It defines concepts and constraints that map onto existing reactive stream systems (RxJS, Reactor, Rx.NET, most.js, etc.).

### 1.1 Design Motivations

RXCAFE emerged from practical experience building LLM-powered applications that required:

- **Low token costs**: Focused evaluators with minimal context instead of monolithic prompts
- **Parallel processing**: Independent evaluators running simultaneously on the same input
- **Multi-modal outputs**: Text, images, audio, and structured data generated from the same source
- **Security boundaries**: Filtering untrusted content before it reaches privileged operations
- **Composability**: Reusable evaluators that work across different applications

Traditional approaches (single large prompts, imperative state machines, custom DSLs) proved inadequate. Reactive streams with structured chunk metadata solved these problems elegantly.

---

2. Core Concepts
-----------------

### 2.1 Chunks

A _chunk_ is the fundamental unit of data in RXCAFE.

Each chunk has:

- **Content type**: one of
  - `text` - textual data
  - `binary` - opaque bytes with a MIME type
  - `null` - marker chunk with no content

- **Producer identifier**: a fully qualified domain name (FQDN) indicating the origin of the chunk (e.g., `com.example.markdown-parser`, `org.myapp.llm-evaluator`)

- **Content**: depending on type
  - `text`: UTF-8 encoded string
  - `binary`: bytes plus MIME type (e.g., `image/png`, `application/pdf`)
  - `null`: no content (used for signaling or control flow)

- **Annotations** (optional): key-value pairs where keys are FQDNs and values are JSON-compatible

Chunks are **immutable**. Any conceptual modification produces a new chunk.

**Design notes:**

- FQDNs for producer IDs and annotation keys prevent naming collisions in systems with many evaluators from different sources
- Text chunks assume UTF-8 encoding; systems requiring other encodings should use binary chunks with appropriate MIME types
- Binary chunks must specify MIME types to enable correct downstream interpretation
- Null chunks are useful for triggering evaluators without carrying data (e.g., periodic polling, completion signals)

### 2.2 Annotations

Annotations attach metadata to chunks without modifying their content.

Properties:

- Keys are FQDNs (e.g., `com.example.sentiment-score`, `org.myapp.deployment.url`)
- Values are JSON-compatible (objects, arrays, strings, numbers, booleans, null)
- Multiple evaluators may write different annotations to the same chunk
- No enforced ownership model - conventions govern who writes what

Common patterns:

- **Analysis results**: `{"com.parser.markdown-ast": {...ast...}}`
- **Semantic interpretations**: `{"com.classifier.needs-image": true}`
- **Derived metadata**: `{"com.deploy.cloudfront-url": "https://..."}`
- **Security markers**: `{"security.trust-level": "untrusted", "security.requires-review": true}`
- **Lineage tracking**: `{"build.source-file": "src/main.c", "build.compiler-version": "gcc-13"}`

**Why annotations matter:**

Annotations enable **context reduction**. Instead of passing full raw content to every evaluator:

1. One evaluator parses content and emits structured representation as annotation
2. Downstream evaluators consume the annotation
3. No duplication of parsing work, minimal token usage for LLM evaluators

Example:
```
Text chunk: "# Hello\nThis is **markdown**"
  → Markdown evaluator adds: {"markdown.ast": {...}}
  → Voice evaluator reads AST annotation, generates speech
  → No reparsing needed
```

### 2.3 Streams

A _stream_ is an ordered, append-only sequence of chunks.

Properties:

- **Append-only**: chunks are never deleted or modified in place
- **Derivable**: new streams are created by applying operators to existing streams
- **Historical**: past chunks remain accessible until garbage-collected
- **Composable**: standard reactive operators (map, filter, merge, flatMap, etc.) create processing graphs

RXCAFE assumes availability of standard reactive stream operations. It does not define new operators - use those provided by your reactive library.

**Stream composition replaces imperative control flow:**

Instead of:
```javascript
if (chunk.needsImage) {
  let prompt = generatePrompt(chunk);
  let image = callImageAPI(prompt);
  saveImage(image);
}
```

Use:
```javascript
stream
  .filter(chunk => chunk.annotations['com.classifier.needs-image'])
  .map(promptGenerator)
  .flatMap(imageGenerator)
  .subscribe(imageSaver)
```

This makes parallelism, branching, and composition explicit and debuggable.

---

3. Evaluators
-------------

### 3.1 Definition

An _evaluator_ is a function that reacts to chunks in a stream.

When invoked, an evaluator may:

1. Emit zero or more new chunks
2. Emit chunks with additional annotations for the input chunk
3. Emit chunks that are causally related to the input but not direct transformations

Evaluators:

- Do not mutate chunks
- Do not control routing (that's done by stream operators)
- May be synchronous or asynchronous
- May be deterministic or nondeterministic (e.g., LLM calls)

**Evaluators are just functions.** The relationship between input chunks and output chunks is defined by the evaluator's logic, not by the framework.

### 3.2 Types of Evaluators

**Pure transformers** - deterministic mapping from input to output:
```javascript
function markdownEvaluator(chunk) {
  const ast = parseMarkdown(chunk.content);
  return {
    ...chunk,
    annotations: {
      ...chunk.annotations,
      'com.parser.markdown-ast': ast
    }
  };
}
```

**LLM evaluators** - call language models:
```javascript
async function summaryEvaluator(chunk) {
  const response = await llm.complete({
    prompt: `Summarize: ${chunk.content}`,
    max_tokens: 100
  });
  return createChunk({
    contentType: 'text',
    content: response.text,
    producer: 'com.myapp.summarizer',
    annotations: {
      'source.chunk-id': chunk.id,
      'llm.model': 'gpt-4',
      'llm.tokens': response.usage.total_tokens
    }
  });
}
```

**Fan-out evaluators** - emit multiple chunks:
```javascript
function chunkSplitter(chunk) {
  return chunk.content
    .split('\n\n')
    .map(paragraph => createChunk({
      contentType: 'text',
      content: paragraph,
      producer: 'com.splitter.paragraph'
    }));
}
```

**Annotation-only evaluators** - add metadata without new chunks:
```javascript
function securityClassifier(chunk) {
  const isSafe = !containsMaliciousPatterns(chunk.content);
  return {
    ...chunk,
    annotations: {
      ...chunk.annotations,
      'security.trust-level': isSafe ? 'trusted' : 'untrusted',
      'security.requires-review': !isSafe
    }
  };
}
```

### 3.3 Composite Evaluators

Composite evaluators wrap multiple child evaluators and define their execution semantics.

**Sequential composition** - run evaluators in order:
```javascript
function sequential(...evaluators) {
  return async (chunk) => {
    let current = chunk;
    for (const evaluator of evaluators) {
      current = await evaluator(current);
    }
    return current;
  };
}
```

**Parallel composition** - run evaluators independently:
```javascript
function parallel(...evaluators) {
  return async (chunk) => {
    const results = await Promise.all(
      evaluators.map(e => e(chunk))
    );
    return results; // returns array of chunks
  };
}
```

These are just function composition patterns. Use them or implement your own based on your needs.

---

4. Architectural Patterns
--------------------------

### 4.1 Annotation-Driven Pipelines

A common pattern: early evaluators analyze and annotate, later evaluators consume annotations.

**Example: Voice synthesis from text**

```javascript
textStream
  .map(markdownParser)           // adds markdown-ast annotation
  .map(voiceSynthesizer)          // reads markdown-ast, generates audio
  .subscribe(audioPlayer)
```

The voice synthesizer never parses markdown - it reads the pre-parsed AST annotation. This:

- Reduces token usage (for LLM-based evaluators)
- Eliminates duplicate work
- Decouples concerns (parsing vs synthesis)

### 4.2 Parallel Branching for Multi-Modal Output

A single chunk can trigger multiple independent processing branches.

**Example: Game narrative with voice and images**

```javascript
// Main narrative generation
const narrativeStream = userInputStream
  .flatMap(gameLLMEvaluator);

// Voice branch
narrativeStream
  .map(markdownParser)
  .map(voiceSynthesizer)
  .subscribe(audioOutput);

// Image branch  
narrativeStream
  .filter(needsImageClassifier)
  .map(imagePromptGenerator)
  .flatMap(stableDiffusionEvaluator)
  .subscribe(imageOutput);
```

Both branches process the same narrative chunks in parallel. Neither blocks the other.

### 4.3 Security Through Stream Filtering

Untrusted content can be filtered before reaching privileged evaluators.

**Example: Safe LLM-assisted automation**

```javascript
// Web search results are untrusted
const webResults = searchStream
  .map(chunk => ({
    ...chunk,
    annotations: {
      'security.trust-level': 'untrusted',
      'security.requires-review': true
    }
  }));

// User files are trusted
const userFiles = fileStream
  .map(chunk => ({
    ...chunk,
    annotations: {'security.trust-level': 'trusted'}
  }));

// Merge and filter for LLM context
const safeContext = merge(webResults, userFiles)
  .filter(chunk => 
    chunk.annotations['security.trust-level'] === 'trusted' ||
    chunk.annotations['security.human-verified'] === true
  );

// Only verified chunks reach bash execution
safeContext
  .flatMap(llmEvaluator)
  .flatMap(bashEvaluator)
  .subscribe(outputHandler);
```

Prompt injections in web results never reach the LLM because they're filtered out. Human review promotes untrusted chunks to verified status.

**This is more reliable than prompt-based guardrails** - the LLM never sees malicious content, so it can't be tricked into executing it.

### 4.4 Build Systems with LLM Assistance

Traditional build systems emit error logs. RXCAFE build systems emit error chunks with annotations pointing to source chunks.

**Example: Parallel error fixing**

```javascript
// Source files flow through compiler
const compileResults = sourceStream
  .map(compilerEvaluator);

// Separate successes and failures
const errors = compileResults
  .filter(chunk => chunk.annotations['build.status'] === 'error');

const successes = compileResults
  .filter(chunk => chunk.annotations['build.status'] === 'success');

// Each error chunk has annotations pointing to source
// LLM evaluators can process errors in parallel
errors
  .flatMap(llmFixEvaluator)  // generates fixed source
  .merge(successes)           // combine with successful builds
  .map(bundlerEvaluator)
  .subscribe(deployEvaluator);
```

The error chunk annotations already contain:
- `build.error-message`: compiler output
- `build.source-chunk-id`: link to original source
- `build.line-number`: where the error occurred

LLM evaluators receive focused context (just the failing code + error) rather than reconstructing it from logs.

Multiple errors can be fixed in parallel because they're independent stream branches.

### 4.5 Context Reduction for Local LLMs

Break large monolithic prompts into many small focused prompts.

**Anti-pattern: Monolithic prompt**
```javascript
const result = await llm.complete({
  prompt: `
    Game state: ${JSON.stringify(gameState)}
    History: ${history.join('\n')}
    Rules: ${rules}
    
    Generate narrative, decide if image needed, format as markdown...
  `,
  max_tokens: 2000
});
// 10k+ token context, slow, expensive
```

**RXCAFE pattern: Focused micro-queries**
```javascript
// Narrative generation: 2k tokens
const narrative = narrativeStream
  .flatMap(chunk => llm.complete({
    prompt: `Game state: ${chunk.annotations['game.state']}\nGenerate narrative:`,
    max_tokens: 500
  }));

// Image decision: 500 tokens
narrative
  .flatMap(chunk => llm.complete({
    prompt: `Does this need an image? ${chunk.content}`,
    max_tokens: 10
  }))
  .filter(chunk => chunk.content === 'yes')
  .flatMap(imagePromptGenerator); // 1k tokens

// Total: 3.5k tokens across multiple small inferences
// Runs in parallel with vLLM batching
```

Benefits:
- Lower total token usage
- Better GPU utilization (parallel small batches)
- Fits in local model context windows
- Faster iteration (small contexts process quickly)

---

5. Implementation Guidance
---------------------------

### 5.1 Technology Choices

RXCAFE is framework-agnostic but works best with:

**Reactive libraries:**
- JavaScript/TypeScript: RxJS, most.js
- Python: RxPY, aioreactive  
- Java/Kotlin: RxJava, Reactor
- .NET: Rx.NET
- Rust: tokio-stream, futures

**LLM inference:**
- Cloud APIs: OpenAI, Anthropic, etc.
- Local inference: vLLM (optimized for micro-queries), llama.cpp, Ollama
- Consider vLLM for production local deployments - continuous batching handles many small parallel requests efficiently

**Why standard libraries matter:**
- Well-documented patterns in LLM training data
- AI coding assistants (like Claude) can write correct code on first try
- No custom DSL to learn
- Existing ecosystem of operators and utilities

### 5.2 Chunk Identity and Lineage

While the core spec doesn't mandate chunk IDs, production systems should include:

```javascript
function createChunk({contentType, content, producer, annotations = {}}) {
  return {
    id: generateUUID(),
    timestamp: Date.now(),
    contentType,
    content,
    producer,
    annotations: {
      ...annotations,
      'system.created-at': Date.now()
    }
  };
}
```

Track lineage via annotations:
```javascript
{
  'lineage.parent-chunk-id': 'abc-123',
  'lineage.operation': 'markdown-parse',
  'lineage.depth': 2
}
```

This enables:
- Debugging (trace chunk origins)
- Caching (deduplicate identical processing)
- Replay (reconstruct stream from history)

### 5.3 Conflict Resolution

When multiple evaluators write the same annotation key:

**Option 1: Namespace by producer**
```javascript
annotations: {
  'com.evaluator-a.sentiment': 0.8,
  'com.evaluator-b.sentiment': 0.6
}
```

**Option 2: Last-write-wins (document this clearly)**
```javascript
// Explicit ordering in pipeline
stream
  .map(evaluatorA)  // writes 'sentiment'
  .map(evaluatorB)  // overwrites 'sentiment'
```

**Option 3: Merge strategies in composite evaluators**
```javascript
function mergeAnnotations(...chunks) {
  const merged = {};
  for (const chunk of chunks) {
    Object.assign(merged, chunk.annotations);
  }
  return merged;
}
```

Choose a convention and document it. RXCAFE doesn't enforce one.

### 5.4 Garbage Collection

Chunks can be garbage-collected when:

1. No streams reference them
2. No downstream evaluators need historical access
3. Retention policies allow deletion

Implementation strategies:

- **Reference counting**: Drop chunks when all derived streams complete
- **Time-based**: Delete chunks older than N days
- **Explicit retention**: Annotation `{'system.retain': true}` prevents GC

For long-running systems, implement cleanup to prevent memory leaks:
```javascript
stream
  .bufferTime(60000)  // 1 minute windows
  .map(processChunks)
  // Older chunks automatically GC'd after window
```

### 5.5 Error Handling

Evaluators may fail. Handle errors at the stream level:

```javascript
stream
  .flatMap(async chunk => {
    try {
      return await riskyEvaluator(chunk);
    } catch (error) {
      return createChunk({
        contentType: 'null',
        producer: 'com.error-handler',
        annotations: {
          'error.message': error.message,
          'error.source-chunk': chunk.id,
          'error.evaluator': 'riskyEvaluator'
        }
      });
    }
  })
  .subscribe(
    chunk => handleSuccess(chunk),
    error => handleStreamError(error)
  );
```

Error chunks flow through the system like any other chunk. Downstream evaluators can react to them.

---

6. Complete Example: LLM App Builder
-------------------------------------

A user asks an LLM to build a web application. The system generates code, deploys it, and returns a running app.

```javascript
// User input becomes chunks
const userMessages = chatInput
  .map(text => createChunk({
    contentType: 'text',
    content: text,
    producer: 'com.chat.user-input'
  }));

// LLM generates JavaScript code
const codeChunks = userMessages
  .flatMap(async chunk => {
    const response = await llm.complete({
      prompt: `Generate a React app for: ${chunk.content}`,
      max_tokens: 2000
    });
    return createChunk({
      contentType: 'text',
      content: response.text,
      producer: 'com.llm.code-generator',
      annotations: {
        'code.language': 'javascript',
        'code.framework': 'react'
      }
    });
  });

// Bundler processes code
const bundledChunks = codeChunks
  .map(chunk => {
    const bundled = webpack.bundle(chunk.content);
    return createChunk({
      contentType: 'binary',
      content: bundled,
      mimeType: 'application/javascript',
      producer: 'com.bundler.webpack',
      annotations: {
        'bundle.size': bundled.length,
        'bundle.hash': hash(bundled)
      }
    });
  });

// Deploy to S3/CloudFront
const deployedChunks = bundledChunks
  .flatMap(async chunk => {
    const url = await uploadToS3(chunk.content);
    return {
      ...chunk,
      annotations: {
        ...chunk.annotations,
        'deploy.url': url,
        'deploy.timestamp': Date.now()
      }
    };
  });

// Generate iframe HTML
const appChunks = deployedChunks
  .map(chunk => {
    const html = `<iframe src="${chunk.annotations['deploy.url']}"></iframe>`;
    return createChunk({
      contentType: 'text',
      content: html,
      producer: 'com.ui.iframe-generator',
      annotations: {
        'ui.type': 'iframe',
        'ui.source-url': chunk.annotations['deploy.url']
      }
    });
  });

// Display to user
appChunks.subscribe(chunk => {
  displayInChat(chunk.content);
});
```

The entire pipeline is just stream composition. Each evaluator is focused and reusable. LLMs are invoked with minimal context. The user sees a working app in their chat interface.

---

7. Design Principles Summary
-----------------------------

1. **Chunks are immutable** - never modify, always create new
2. **Evaluators are pure functions** - no side effects except emitting chunks
3. **Annotations carry metadata** - avoid reparsing or re-analyzing
4. **Streams express control flow** - no imperative routing logic in evaluators
5. **Parallel by default** - independent evaluators run concurrently
6. **Security through filtering** - untrusted content never reaches privileged evaluators
7. **Context reduction** - many small LLM calls beat one large call
8. **Standard libraries** - use Rx, not custom DSLs
9. **LLMs as evaluators** - they're just async functions
10. **History is append-only** - derive new streams, don't mutate old ones

---

8. Comparison to Alternatives
------------------------------

**vs. Imperative pipelines (scripts, state machines):**
- RXCAFE: Declarative, composable, naturally parallel
- Imperative: Harder to reason about, sequential by default

**vs. Custom DSLs (YAML configs, graph languages):**
- RXCAFE: Uses existing libraries, AI assistants already know the patterns
- DSLs: Require learning, AIs hallucinate syntax, vendor lock-in

**vs. Prompt-chaining frameworks:**
- RXCAFE: Multi-modal (not just text), built-in security filtering, reusable non-LLM evaluators
- Frameworks: Text-focused, limited composition, monolithic prompts

**vs. Traditional build systems (Make, Gradle):**
- RXCAFE: Native LLM integration, annotations for metadata, reactive
- Traditional: File-based, imperative, no LLM primitives

---

9. Proven Applications
-----------------------

RXCAFE patterns have been validated in production systems including:

- **Text adventure games** with parallel voice synthesis and image generation
- **LLM chat applications** with multi-stage processing and security filtering  
- **Build pipelines** with LLM-assisted error correction
- **Media processing** with annotation-driven transcoding

The architecture is not theoretical - it emerged from building these systems and extracting common patterns.

---

10. Conclusion
--------------

RXCAFE provides a unified architecture for building complex systems from simple, composable parts. By leveraging reactive streams, immutable chunks, and annotations, it enables:

- **Efficient LLM usage** through context reduction and micro-queries
- **Security** through stream filtering
- **Modularity** through focused evaluators
- **Parallelism** through stream branching
- **Extensibility** through annotations
- **Accessibility** through standard libraries

The architecture works because it builds on proven primitives (reactive streams, pure functions) rather than inventing new abstractions. This makes it learnable by humans, writable by AI assistants, and applicable across domains.

Start with streams, chunks, and evaluators. Compose them with standard Rx operators. Let the architecture emerge from composition rather than imposing structure upfront.

---

Appendix A: Glossary
--------------------

- **Chunk**: Immutable data unit with content, producer ID, and optional annotations
- **Annotation**: Metadata key-value pair attached to a chunk (key is FQDN, value is JSON)
- **Evaluator**: Function that processes chunks and emits new chunks or annotations
- **Stream**: Ordered, append-only sequence of chunks
- **Producer ID**: FQDN identifying the evaluator that created a chunk
- **Composite evaluator**: Evaluator that wraps and coordinates multiple child evaluators
- **FQDN**: Fully qualified domain name (e.g., com.example.evaluator-name)
- **Micro-query**: Small, focused LLM inference request (typically <1k tokens)

---

Appendix B: Reference Implementations
--------------------------------------

For reference implementations and examples, see:

- **Who Stole My Arms**: https://github.com/jorisvddonk/who-stole-my-arms
  Text adventure game demonstrating CAFE primitives (chunks, annotations, evaluators, FQDNs)

- **Sheetbot**: https://github.com/jorisvddonk/sheetbot  
  Collaborative spreadsheet with reactive LLM evaluation

- **vLLM micro-queries experiment**: https://github.com/jorisvddonk/vllm-microqueries-experiment
  Benchmarking parallel small LLM queries vs batched approaches

---

Document Version: 2.0  
Last Updated: 2026-02-06  
License: MIT
