import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export interface GlobParameters {
  pattern: string;
  cwd?: string;
}

export interface GlobResult {
  pattern: string;
  cwd: string;
  matches: string[];
  error?: string;
}

export class GlobTool {
  readonly name = 'glob';
  readonly systemPrompt = GLOB_SYSTEM_PROMPT;

  execute(parameters: GlobParameters): GlobResult {
    const { pattern, cwd = '.' } = parameters;
    
    try {
      const matches = this.glob(pattern, cwd);
      return { pattern, cwd, matches };
    } catch (error: any) {
      return { pattern, cwd, matches: [], error: error.message };
    }
  }

  private glob(pattern: string, cwd: string): string[] {
    const results: string[] = [];
    const parts = pattern.split('/');
    const firstGlob = parts.findIndex(p => p.includes('*') || p.includes('?'));
    
    if (firstGlob === -1) {
      try {
        statSync(join(cwd, pattern));
        results.push(pattern);
      } catch {}
      return results;
    }
    
    const prefix = parts.slice(0, firstGlob).join('/');
    const globPart = parts.slice(firstGlob).join('/');
    const searchDir = join(cwd, prefix || '.');
    
    this.globRecursive(searchDir, globPart, prefix || '.', results);
    return results;
  }

  private globRecursive(dir: string, pattern: string, relativePath: string, results: string[]): void {
    try {
      const entries = readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;
        
        if (this.match(pattern, relPath)) {
          results.push(relPath);
        }
        
        try {
          if (statSync(fullPath).isDirectory()) {
            this.globRecursive(fullPath, pattern, relPath, results);
          }
        } catch {}
      }
    } catch {}
  }

  private match(pattern: string, name: string): boolean {
    const regex = new RegExp(
      '^' + pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.') +
      '$'
    );
    return regex.test(name);
  }
}

export const GLOB_SYSTEM_PROMPT = `
Tool: glob
Description: Searches for files matching a glob pattern
Parameters:
- pattern: Glob pattern to match (e.g., "*.ts", "src/**/*.js", "**/*.json")
- cwd: Base directory to search from (optional, defaults to current directory)

Glob Patterns:
- * matches any characters except /
- ** matches any characters including /
- ? matches a single character
- [abc] matches character class

Returns: Array of matching file paths

To use this tool, format your response like this:
<|tool_call|>{"name":"glob","parameters":{"pattern":"**/*.ts","cwd":"/home/user/project"}}<|tool_call_end|>
`;
