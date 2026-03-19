/**
 * Read File Tool
 * Reads file contents from the filesystem
 */

import { readFile } from 'fs/promises';
import { stat } from 'fs/promises';

export interface ReadFileParameters {
  path: string;
}

export interface ReadFileResult {
  path: string;
  content: string;
  size: number;
  error?: string;
}

export class ReadFileTool {
  readonly name = 'readFile';
  readonly systemPrompt = READ_FILE_SYSTEM_PROMPT;

  async execute(parameters: ReadFileParameters): Promise<ReadFileResult> {
    const path = parameters.path;
    
    try {
      const stats = await stat(path);
      if (stats.isDirectory()) {
        return { path, content: '', size: 0, error: 'Path is a directory, not a file' };
      }
      
      const content = await readFile(path, 'utf-8');
      return { path, content, size: stats.size };
    } catch (error: any) {
      return { path, content: '', size: 0, error: error.message };
    }
  }
}

export const READ_FILE_SYSTEM_PROMPT = `
Tool: readFile
Description: Reads the contents of a file from the filesystem
Parameters:
- path: The absolute or relative path to the file to read (required)

Returns: The file contents and size, or an error message if the file cannot be read

To use this tool, format your response like this:
<|tool_call|>{"name":"readFile","parameters":{"path":"/path/to/file.txt"}}<|tool_call_end|>
`;
