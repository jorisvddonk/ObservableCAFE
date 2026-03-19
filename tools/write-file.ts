/**
 * Write File Tool
 * Writes content to files on the filesystem
 */

import { writeFile } from 'fs/promises';

export interface WriteFileParameters {
  path: string;
  content: string;
}

export interface WriteFileResult {
  path: string;
  bytesWritten: number;
  error?: string;
}

export class WriteFileTool {
  readonly name = 'writeFile';
  readonly systemPrompt = WRITE_FILE_SYSTEM_PROMPT;

  async execute(parameters: WriteFileParameters): Promise<WriteFileResult> {
    const { path, content } = parameters;
    
    try {
      const bytesWritten = await writeFile(path, content, 'utf-8');
      return { path, bytesWritten: Buffer.byteLength(content, 'utf-8') };
    } catch (error: any) {
      return { path, bytesWritten: 0, error: error.message };
    }
  }
}

export const WRITE_FILE_SYSTEM_PROMPT = `
Tool: writeFile
Description: Writes content to a file, creating it or overwriting existing content
Parameters:
- path: The absolute or relative path to the file to write (required)
- content: The content to write to the file (required)

Returns: Number of bytes written, or an error message if the write failed

To use this tool, format your response like this:
<|tool_call|>{"name":"writeFile","parameters":{"path":"output.txt","content":"Hello world"}}<|tool_call_end|>
`;
