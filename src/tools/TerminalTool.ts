import { Tool, ToolContext, ToolResult } from './Tool';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

const destructivePatterns = [
  /rm\s+-rf\s+\//i,
  /: \(\) \{ : \| : & \}; :/,
  /shutdown/i,
  /reboot/i,
  /mkfs/i,
  /dd\s+if=\/dev\//i,
];

export class TerminalTool implements Tool {
  name: string = 'terminal';
  description: string = 'Executes shell commands in the project workspace.';
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async execute(args: { command?: string; arg?: string }, context: ToolContext): Promise<ToolResult> {
    const start = Date.now();
    const command = (args.command ?? args.arg)?.trim();
    if (!command) {
      return { toolName: this.name, success: false, output: '', error: 'Command is required.' };
    }

    if (destructivePatterns.some((pattern) => pattern.test(command))) {
      return { toolName: this.name, success: false, output: '', error: 'Command rejected by safety policy.' };
    }

    if (context.sandboxLevel === 'strict' && /[;&|>`]/.test(command)) {
      return { toolName: this.name, success: false, output: '', error: 'Strict sandbox prevents chained or redirected commands.' };
    }

    try {
      const { stdout, stderr } = await execPromise(command, { cwd: this.workspaceDir, timeout: 60_000 });
      if (stderr) {
        return {
          toolName: this.name,
          success: false,
          output: stdout,
          error: stderr,
          durationMs: Date.now() - start,
        };
      }
      return { toolName: this.name, success: true, output: stdout, durationMs: Date.now() - start };
    } catch (error: any) {
      return {
        toolName: this.name,
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
      };
    }
  }
}
