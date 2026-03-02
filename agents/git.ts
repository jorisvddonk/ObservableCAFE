import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createTextChunk } from '../lib/chunk.js';
import { EMPTY, filter, mergeMap, map, catchError } from '../lib/stream.js';
import { detectToolCalls } from '../evaluators/tool-call-detector.js';
import { executeTools, getToolsSystemPrompt } from '../evaluators/tool-executor.js';
import { completeTurnWithLLM } from '../lib/evaluator-utils.js';
import { gitTool } from '../tools/git.js';

const GIT_TOOLS = ['git', 'readFile'];

export const gitAgent: AgentDefinition = {
  name: 'git',
  description: 'Git operations with code and diff visualization support',
  configSchema: {
    type: 'object',
    properties: {
      backend: { type: 'string', description: 'LLM backend (kobold or ollama)' },
      model: { type: 'string', description: 'Model name' },
      cwd: { type: 'string', description: 'Working directory for git operations' }
    },
    required: ['backend', 'model']
  },
  
  initialize(session: AgentSessionContext) {
    const cwd = (session.sessionConfig as any)?.cwd || process.cwd();
    
    if (!session.systemPrompt) {
      session.systemPrompt = `You are a Git assistant that helps users work with version control.

You can execute git commands and show file contents with syntax highlighting.

When users ask about:
- **Status**: Show git status with branch info, staged/unstaged changes
- **Log**: Show commit history with optional file filtering
- **Diff**: Show differences with visual diff output (these appear as diff widgets)
- **Show**: Display file contents from specific commits (these appear as code blocks)
- **Branch**: List, create, or switch branches

Special commands you support:
- "show me <file>" - Display file content with syntax highlighting
- "show me <file> at <commit>" - Show file from specific commit
- "diff <commit>" - Show changes in a commit
- "diff <file>" - Show changes to a specific file
- "what changed?" - Show recent commits and their diffs

${getToolsSystemPrompt(GIT_TOOLS)}

When showing file contents, the system will automatically detect the programming language and apply syntax highlighting.
When showing diffs, the system will render them as visual diff widgets with added/removed highlighting.`;
    }

    const sub = session.inputStream.pipe(
      filter((chunk: Chunk) => chunk.contentType === 'text' && chunk.annotations['chat.role'] === 'user'),
      
      // Check for special git commands and handle them directly
      map((chunk: Chunk) => {
        const content = chunk.content as string;
        const lowerContent = content.toLowerCase().trim();
        
        // Handle special commands with code/diff output
        if (lowerContent.startsWith('git show ') || lowerContent.match(/^show\s+\S+/)) {
          return handleShowCommand(chunk, cwd);
        }
        
        if (lowerContent.startsWith('git diff ') || lowerContent.match(/^diff\s+/)) {
          return handleDiffCommand(chunk, cwd);
        }
        
        if (lowerContent === 'git status' || lowerContent === 'status') {
          return handleStatusCommand(chunk, cwd);
        }
        
        if (lowerContent.startsWith('git log') || lowerContent === 'log' || lowerContent === 'history') {
          return handleLogCommand(chunk, cwd);
        }
        
        // Pass through for LLM processing
        return { type: 'llm', chunk } as const;
      }),
      
      mergeMap((result: any) => {
        if (result.type === 'chunks') {
          // Direct chunks from special command handling
          return result.chunks;
        }
        // Process with LLM
        return processWithLLM(result.chunk, session, cwd);
      }),
      
      catchError((error: Error) => {
        session.errorStream.next(error);
        return EMPTY;
      })
    ).subscribe({
      next: (chunk: any) => session.outputStream.next(chunk as Chunk),
      error: (error: any) => session.errorStream.next(error as Error)
    });
    
    session.pipelineSubscription = sub;
  }
};

function handleShowCommand(userChunk: Chunk, cwd: string): { type: 'chunks'; chunks: Chunk[] } | { type: 'llm'; chunk: Chunk } {
  const content = userChunk.content as string;
  
  // Parse: "git show <ref>:<path>" or "show <file> at <commit>" or "show <file>"
  let ref = 'HEAD';
  let path = '';
  
  const gitShowMatch = content.match(/git\s+show\s+(\S+)(?::(\S+))?/);
  const showAtMatch = content.match(/show\s+(\S+)(?:\s+at\s+(\S+))?/i);
  
  if (gitShowMatch) {
    if (gitShowMatch[2]) {
      ref = gitShowMatch[1];
      path = gitShowMatch[2];
    } else {
      path = gitShowMatch[1];
    }
  } else if (showAtMatch) {
    path = showAtMatch[1];
    if (showAtMatch[2]) ref = showAtMatch[2];
  }
  
  if (!path) return { type: 'llm', chunk: userChunk };
  
  const chunks = gitTool.showFileContent(path, ref, cwd);
  
  // Add explanatory text chunk first
  const explanation = createTextChunk(`Showing ${path} at ${ref}:`, 'com.rxcafe.git', {
    'chat.role': 'assistant'
  });
  
  return { type: 'chunks', chunks: [explanation, ...chunks] };
}

function handleDiffCommand(userChunk: Chunk, cwd: string): { type: 'chunks'; chunks: Chunk[] } | { type: 'llm'; chunk: Chunk } {
  const content = userChunk.content as string;
  
  // Parse: "git diff <args>" or "diff <args>"
  let args: string[] = [];
  
  const gitDiffMatch = content.match(/git\s+diff\s*(.*)/);
  const diffMatch = content.match(/^diff\s+(.*)/i);
  
  if (gitDiffMatch && gitDiffMatch[1]) {
    args = gitDiffMatch[1].trim().split(/\s+/).filter(Boolean);
  } else if (diffMatch && diffMatch[1]) {
    args = diffMatch[1].trim().split(/\s+/).filter(Boolean);
  } else if (content === 'git diff' || content.toLowerCase() === 'diff') {
    args = [];
  }
  
  const chunks = gitTool.diff(args, cwd);
  
  // Add explanatory text chunk first if we have actual diff chunks
  if (chunks.length > 0 && chunks[0].annotations?.['diff.type']) {
    const target = args.length > 0 ? args.join(' ') : 'working directory';
    const explanation = createTextChunk(`Diff for ${target}:`, 'com.rxcafe.git', {
      'chat.role': 'assistant'
    });
    return { type: 'chunks', chunks: [explanation, ...chunks] };
  }
  
  return { type: 'chunks', chunks };
}

function handleStatusCommand(userChunk: Chunk, cwd: string): { type: 'chunks'; chunks: Chunk[] } {
  const status = gitTool.status(cwd);
  
  let message = `On branch **${status.branch}**`;
  if (status.ahead > 0) message += ` (ahead ${status.ahead})`;
  if (status.behind > 0) message += ` (behind ${status.behind})`;
  message += '\n\n';
  
  if (status.staged.length > 0) {
    message += '**Staged changes:**\n';
    for (const f of status.staged) {
      const icon = f.status === 'added' ? '+' : f.status === 'deleted' ? '-' : f.status === 'renamed' ? '→' : 'M';
      message += `  ${icon} ${f.path}\n`;
    }
    message += '\n';
  }
  
  if (status.unstaged.length > 0) {
    message += '**Unstaged changes:**\n';
    for (const f of status.unstaged) {
      const icon = f.status === 'added' ? '+' : f.status === 'deleted' ? '-' : f.status === 'renamed' ? '→' : 'M';
      message += `  ${icon} ${f.path}\n`;
    }
    message += '\n';
  }
  
  if (status.untracked.length > 0) {
    message += `**Untracked files:** ${status.untracked.length}\n`;
    for (const f of status.untracked.slice(0, 10)) {
      message += `  ? ${f}\n`;
    }
    if (status.untracked.length > 10) {
      message += `  ... and ${status.untracked.length - 10} more\n`;
    }
  }
  
  if (status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0) {
    message += 'Working tree clean ✓';
  }
  
  const chunk = createTextChunk(message, 'com.rxcafe.git', {
    'chat.role': 'assistant'
  });
  
  return { type: 'chunks', chunks: [chunk] };
}

function handleLogCommand(userChunk: Chunk, cwd: string): { type: 'chunks'; chunks: Chunk[] } {
  const log = gitTool.log({ maxCount: 10, format: '%h %s (%cr) <%an>' }, cwd);
  
  let message = '**Recent commits:**\n\n';
  if (log.success) {
    message += log.stdout.split('\n').map(line => `  ${line}`).join('\n');
  } else {
    message += `Error: ${log.stderr}`;
  }
  
  const chunk = createTextChunk(message, 'com.rxcafe.git', {
    'chat.role': 'assistant'
  });
  
  return { type: 'chunks', chunks: [chunk] };
}

function processWithLLM(chunk: Chunk, session: AgentSessionContext, cwd: string) {
  // Use the standard LLM flow with tool detection
  return detectToolCalls()(chunk).pipe(
    mergeMap((c: Chunk) => completeTurnWithLLM(c, session.createLLMChunkEvaluator(), session)),
    mergeMap(detectToolCalls()),
    mergeMap(executeTools({ tools: GIT_TOOLS }))
  );
}

export default gitAgent;