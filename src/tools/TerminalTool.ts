import { Tool, ToolResult } from './Tool';
import { exec } from 'child_process';
import * as path from 'path';

export class TerminalTool implements Tool {
  name: string = 'terminal';
  description: string = 'Executes shell commands in the project workspace.';
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async execute(args: { command: string }): Promise<ToolResult> {
    return new Promise((resolve) => {
      exec(args.command, { cwd: this.workspaceDir }, (error, stdout, stderr) => {
        if (error) {
          resolve({ toolName: this.name, success: false, output: stdout, error: error.message + (stderr ? '\n' + stderr : '') });
        } else {
          resolve({ toolName: this.name, success: true, output: stdout });
        }
      });
    });
  }
}
