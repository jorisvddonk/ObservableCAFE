/**
 * Update File Tool
 * Write, append, or search-replace in files
 */

import { readFile, writeFile } from 'fs/promises';

export interface UpdateFileParameters {
  path: string;
  content?: string;
  append?: boolean;
  search?: string;
  replace?: string;
}

export interface UpdateFileResult {
  path: string;
  action: string;
  bytesWritten?: number;
  error?: string;
}

export class UpdateFileTool {
  readonly name = 'updateFile';
  readonly systemPrompt = UPDATE_FILE_SYSTEM_PROMPT;

  async execute(parameters: UpdateFileParameters): Promise<UpdateFileResult> {
    const { path, content, append, search, replace } = parameters;
    
    try {
      if (append && content !== undefined) {
        const existing = await readFile(path, 'utf-8').catch(() => '');
        await writeFile(path, existing + content, 'utf-8');
        return { path, action: 'append', bytesWritten: Buffer.byteLength(content, 'utf-8') };
      }
      
      if (search !== undefined && replace !== undefined) {
        const existing = await readFile(path, 'utf-8');
        const newContent = existing.split(search).join(replace);
        await writeFile(path, newContent, 'utf-8');
        return { path, action: 'replace', bytesWritten: Buffer.byteLength(newContent, 'utf-8') };
      }
      
      if (content !== undefined) {
        await writeFile(path, content, 'utf-8');
        return { path, action: 'write', bytesWritten: Buffer.byteLength(content, 'utf-8') };
      }
      
      return { path, action: 'none', error: 'No valid operation specified' };
    } catch (error: any) {
      return { path, action: 'error', error: error.message };
    }
  }
}

export const UPDATE_FILE_SYSTEM_PROMPT = `
Tool: updateFile
Description: Updates a file by writing, appending, or performing search-replace
Parameters:
- path: The absolute or relative path to the file (required)
- content: New content to write (use with action: "write" or "append")
- append: If true, appends content instead of overwriting (optional)
- search: Text to search for in the file (for search-replace)
- replace: Text to replace the search string with (for search-replace)

Operations:
1. Write: Provide "content" (overwrites file)
2. Append: Provide "content" and "append: true"
3. Search-Replace: Provide "search" and "replace"

Returns: Action performed and bytes written, or error message

To use this tool, format your response like this:
<|tool_call|>{"name":"updateFile","parameters":{"path":"log.txt","content":"new line\\n","append":true}}<|tool_call_end|>
<|tool_call|>{"name":"updateFile","parameters":{"path":"config.json","search":"old","replace":"new"}}<|tool_call_end|>
`;
