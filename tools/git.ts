/**
 * Git Tool
 * Executes git commands via child process
 */

import { execSync } from 'child_process';
import { createTextChunk, createNullChunk } from '../lib/chunk.js';
import type { Chunk } from '../lib/chunk.js';

export interface GitParameters {
  command: string;
  args?: string[];
  cwd?: string;
}

export interface GitResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface GitFileChange {
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged' | 'unknown';
  path: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

export class GitTool {
  readonly name = 'git';
  readonly systemPrompt = GIT_TOOL_SYSTEM_PROMPT;
  private defaultCwd = process.cwd();

  private execGit(args: string[], cwd?: string): GitResult {
    const command = `git ${args.join(' ')}`;
    try {
      const stdout = execSync(command, {
        cwd: cwd || this.defaultCwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });
      return {
        command,
        stdout: stdout.trim(),
        stderr: '',
        exitCode: 0,
        success: true
      };
    } catch (error: any) {
      return {
        command,
        stdout: error.stdout?.toString().trim() || '',
        stderr: error.stderr?.toString().trim() || error.message,
        exitCode: error.status || 1,
        success: false
      };
    }
  }

  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      'ts': 'typescript', 'tsx': 'typescript',
      'js': 'javascript', 'jsx': 'javascript',
      'py': 'python', 'rb': 'ruby', 'rs': 'rust',
      'go': 'go', 'java': 'java', 'kt': 'kotlin',
      'c': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'h': 'c', 'hpp': 'cpp',
      'cs': 'csharp', 'fs': 'fsharp', 'fsx': 'fsharp',
      'swift': 'swift', 'scala': 'scala', 'clj': 'clojure',
      'ex': 'elixir', 'exs': 'elixir', 'erl': 'erlang',
      'hs': 'haskell', 'lua': 'lua', 'php': 'php',
      'pl': 'perl', 'r': 'r', 'sh': 'bash', 'bash': 'bash',
      'zsh': 'zsh', 'fish': 'fish', 'ps1': 'powershell',
      'sql': 'sql', 'html': 'html', 'htm': 'html',
      'css': 'css', 'scss': 'scss', 'sass': 'sass',
      'less': 'less', 'json': 'json', 'yaml': 'yaml',
      'yml': 'yaml', 'xml': 'xml', 'toml': 'toml',
      'md': 'markdown', 'markdown': 'markdown',
      'dockerfile': 'dockerfile', 'makefile': 'makefile',
      'vue': 'vue', 'svelte': 'svelte', 'astro': 'astro'
    };
    return langMap[ext] || ext || 'text';
  }

  execute(parameters: GitParameters): GitResult {
    const { command, args = [], cwd } = parameters;
    return this.execGit([command, ...args], cwd);
  }

  status(cwd?: string): GitStatus {
    // Get branch info
    const branchResult = this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const branch = branchResult.success ? branchResult.stdout : 'unknown';

    // Get ahead/behind
    const upstreamResult = this.execGit(['rev-list', '--left-right', '--count', `${branch}...@{u}`], cwd);
    let ahead = 0, behind = 0;
    if (upstreamResult.success) {
      const match = upstreamResult.stdout.match(/(\d+)\s+(\d+)/);
      if (match) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    }

    // Parse status
    const statusResult = this.execGit(['status', '--porcelain', '-b'], cwd);
    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];

    if (statusResult.success) {
      const lines = statusResult.stdout.split('\n');
      for (const line of lines) {
        if (!line || line.startsWith('##')) continue;
        
        const stagedStatus = line[0] || ' ';
        const unstagedStatus = line[1] || ' ';
        const path = line.slice(3);

        const statusMap: Record<string, GitFileChange['status']> = {
          'A': 'added', 'M': 'modified', 'D': 'deleted',
          'R': 'renamed', 'C': 'copied', 'U': 'unmerged',
          '?': 'unknown'
        };

        if (stagedStatus !== ' ' && stagedStatus !== '?') {
          staged.push({ status: statusMap[stagedStatus] || 'unknown', path });
        }
        if (unstagedStatus !== ' ') {
          unstaged.push({ status: statusMap[unstagedStatus] || 'unknown', path });
        }
        if (stagedStatus === '?') {
          untracked.push(path);
        }
      }
    }

    return { branch, ahead, behind, staged, unstaged, untracked };
  }

  showFileContent(path: string, ref: string = 'HEAD', cwd?: string): Chunk[] {
    const result = this.execGit(['show', `${ref}:${path}`], cwd);
    const filename = path.split('/').pop() || path;
    const language = this.detectLanguage(filename);

    if (!result.success) {
      return [createTextChunk(`Error reading ${path}: ${result.stderr}`, 'com.rxcafe.git', {
        'chat.role': 'assistant'
      })];
    }

    return [createTextChunk(result.stdout, 'com.rxcafe.git', {
      'chat.role': 'assistant',
      'code.language': language,
      'code.filename': filename,
      'code.path': path,
      'code.ref': ref
    })];
  }

  diff(args: string[] = [], cwd?: string): Chunk[] {
    const result = this.execGit(['diff', ...args], cwd);
    
    if (!result.success) {
      return [createTextChunk(`Error: ${result.stderr}`, 'com.rxcafe.git', {
        'chat.role': 'assistant'
      })];
    }

    if (!result.stdout) {
      return [createTextChunk('No differences found.', 'com.rxcafe.git', {
        'chat.role': 'assistant'
      })];
    }

    // Parse diff output and create diff chunks
    const chunks: Chunk[] = [];
    const diffText = result.stdout;
    const files = this.parseDiffFiles(diffText);

    for (const file of files) {
      chunks.push(createTextChunk(file.newContent, 'com.rxcafe.git', {
        'chat.role': 'assistant',
        'diff.type': 'unified',
        'diff.oldContent': file.oldContent,
        'diff.newContent': file.newContent,
        'diff.oldFilename': file.oldPath,
        'diff.newFilename': file.newPath,
        'diff.language': this.detectLanguage(file.newPath),
        'git.command': `git diff ${args.join(' ')}`
      }));
    }

    return chunks.length > 0 ? chunks : [createTextChunk(diffText, 'com.rxcafe.git', {
      'chat.role': 'assistant'
    })];
  }

  private parseDiffFiles(diffText: string): Array<{oldPath: string, newPath: string, oldContent: string, newContent: string}> {
    const files: Array<{oldPath: string, newPath: string, oldContent: string, newContent: string}> = [];
    const lines = diffText.split('\n');
    
    let currentFile: any = null;
    let oldLines: string[] = [];
    let newLines: string[] = [];
    let oldPath = '';
    let newPath = '';

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push({
            oldPath: currentFile.oldPath,
            newPath: currentFile.newPath,
            oldContent: oldLines.join('\n'),
            newContent: newLines.join('\n')
          });
        }
        currentFile = { oldPath: '', newPath: '' };
        oldLines = [];
        newLines = [];
      } else if (line.startsWith('--- a/')) {
        oldPath = line.slice(6);
        if (currentFile) currentFile.oldPath = oldPath;
      } else if (line.startsWith('+++ b/')) {
        newPath = line.slice(6);
        if (currentFile) currentFile.newPath = newPath;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        newLines.push(line.slice(1));
      } else if (!line.startsWith('@@') && !line.startsWith('index ')) {
        // Context line
        if (line.length > 0) {
          oldLines.push(line.slice(1));
          newLines.push(line.slice(1));
        }
      }
    }

    if (currentFile && currentFile.newPath) {
      files.push({
        oldPath: currentFile.oldPath || oldPath,
        newPath: currentFile.newPath || newPath,
        oldContent: oldLines.join('\n'),
        newContent: newLines.join('\n')
      });
    }

    return files;
  }

  log(options: { maxCount?: number; format?: string; path?: string } = {}, cwd?: string): GitResult {
    const args = ['log'];
    if (options.maxCount) args.push(`-${options.maxCount}`);
    if (options.format) args.push(`--format=${options.format}`);
    if (options.path) args.push('--', options.path);
    else args.push('--oneline');
    return this.execGit(args, cwd);
  }

  showCommit(commit: string, cwd?: string): Chunk[] {
    // Get commit info
    const infoResult = this.execGit(['show', '--stat', '--format=fuller', commit], cwd);
    
    // Get diff for the commit
    return this.diff([`${commit}^..${commit}`], cwd);
  }
}

export const GIT_TOOL_SYSTEM_PROMPT = `
You have access to a git tool for version control operations.

Tool: git
Description: Execute git commands and retrieve repository information
Parameters:
- command: The git subcommand to execute (e.g., 'status', 'log', 'diff', 'show')
- args: Array of arguments for the command (optional)
- cwd: Working directory for the command (optional)

Common commands:
- status: Get repository status including staged/unstaged changes
- log: View commit history (use --oneline, -n 10, etc.)
- diff: Show changes between commits, branches, or working tree
- show: Show various types of objects (commits, files, etc.)
- branch: List, create, or delete branches
- stash: Stash changes for later

To use this tool, format your response like this:
<|tool_call|>{"name":"git","parameters":{"command":"status"}}<|tool_call_end|>

Or for more complex operations:
<|tool_call|>{"name":"git","parameters":{"command":"diff","args":["HEAD~1","HEAD"]}}<|tool_call_end|>

Notes:
- The tool runs in the current working directory by default
- Large diffs are parsed and returned as structured data
- File contents are returned with appropriate language annotations
`;

export const gitTool = new GitTool();