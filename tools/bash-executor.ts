/**
 * Bash Tool
 * 
 * Executes shell commands in a child process.
 * Supports timeout, captures stdout/stderr, and handles process errors.
 * 
 * Security Note: This tool runs commands with server privileges.
 * Access should be restricted via trust levels and API authentication.
 */

import { execSync, spawn } from 'child_process';

/**
 * Parameters for bash execution
 */
export interface BashParameters {
  command: string;
  timeout?: number;
}

/**
 * Result of bash execution
 */
export interface BashResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Executes bash commands in a subprocess.
 * Captures output and handles timeouts.
 */
export class BashTool {
  readonly name = 'bash';
  readonly systemPrompt = BASH_TOOL_SYSTEM_PROMPT;
  private readonly defaultTimeout = 30000;

  /**
   * Execute a bash command with timeout support.
   * @param parameters.command - The shell command to execute
   * @param parameters.timeout - Max execution time in ms (default: 30000)
   * @returns Object with stdout, stderr, exitCode, and timedOut flag
   */
  execute(parameters: BashParameters): BashResult {
    const command = parameters.command;
    const timeout = parameters.timeout || this.defaultTimeout;

    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    let timedOut = false;

    try {
      const child = spawn('bash', ['-c', command], {
        cwd: process.cwd(),
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      const result = new Promise<BashResult>((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeout);

        child.on('close', (code) => {
          clearTimeout(timer);
          exitCode = code;
          stdout = stdoutData.trim();
          stderr = stderrData.trim();
          resolve({
            command,
            stdout,
            stderr,
            exitCode,
            timedOut
          });
        });

        child.on('error', (error) => {
          clearTimeout(timer);
          resolve({
            command,
            stdout: stdoutData.trim(),
            stderr: stderrData.trim() + '\n' + error.message,
            exitCode,
            timedOut
          });
        });
      });

      return result as unknown as BashResult;
    } catch (error: any) {
      return {
        command,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        timedOut: false
      };
    }
  }
}

export const BASH_TOOL_SYSTEM_PROMPT = `
You have access to a bash command execution tool called "bash" that runs shell commands.

Tool: bash
Description: Executes bash shell commands and returns the output
Parameters:
- command: The bash command to execute (required)
- timeout: Maximum execution time in milliseconds (optional, default: 30000)

To use this tool, format your response like this:
<|tool_call|>{"name":"bash","parameters":{"command":"ls -la"}}<|tool_call_end|>

Notes:
- The command runs in a bash shell with the same environment as the server
- stdout and stderr are captured and returned
- Commands that take longer than the timeout will be killed
- Only use this tool when you need to run system commands, file operations, or get system information
`;
