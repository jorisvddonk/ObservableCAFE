import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';

export interface ListDirectoryParameters {
  path: string;
}

export interface FileInfo {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface ListDirectoryResult {
  path: string;
  files: FileInfo[];
  error?: string;
}

export class ListDirectoryTool {
  readonly name = 'listDirectory';
  readonly systemPrompt = LIST_DIRECTORY_SYSTEM_PROMPT;

  async execute(parameters: ListDirectoryParameters): Promise<ListDirectoryResult> {
    const path = parameters.path;
    
    try {
      const entries = await readdir(path);
      const files: FileInfo[] = [];
      
      for (const name of entries) {
        try {
          const fullPath = join(path, name);
          const stats = await stat(fullPath);
          files.push({
            name,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtimeMs
          });
        } catch {
          files.push({ name, isDirectory: false, size: 0, modified: 0 });
        }
      }
      
      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      
      return { path, files };
    } catch (error: any) {
      return { path, files: [], error: error.message };
    }
  }
}

export const LIST_DIRECTORY_SYSTEM_PROMPT = `
Tool: listDirectory
Description: Lists files and directories in a given path
Parameters:
- path: The absolute or relative path to list (required)

Returns: Array of files with name, type (file/dir), size, and modification time

To use this tool, format your response like this:
<|tool_call|>{"name":"listDirectory","parameters":{"path":"/home/user/projects"}}<|tool_call_end|>
`;
