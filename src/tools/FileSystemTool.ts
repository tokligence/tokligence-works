import { Tool, ToolContext, ToolResult } from './Tool';
import * as fs from 'fs/promises';
import * as path from 'path';

const restrictedPatterns = [/\b\.\./];

export class FileSystemTool implements Tool {
  name: string = 'file_system';
  description: string = 'Provides utilities for reading and writing files in the project workspace.';
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async execute(args: { action: 'read' | 'write'; path: string; content?: string }, context: ToolContext): Promise<ToolResult> {
    const start = Date.now();
    const relativePath = args.path;
    if (!relativePath) {
      return { toolName: this.name, success: false, output: '', error: 'Path is required.' };
    }

    if (restrictedPatterns.some((pattern) => pattern.test(relativePath))) {
      return { toolName: this.name, success: false, output: '', error: `Path ${relativePath} contains restricted segments.` };
    }

    const fullPath = path.resolve(this.workspaceDir, relativePath);

    if (!fullPath.startsWith(this.workspaceDir)) {
      return { toolName: this.name, success: false, output: '', error: `Access denied: Path ${relativePath} is outside the workspace.` };
    }

    try {
      if (args.action === 'read') {
        const content = await fs.readFile(fullPath, 'utf8');
        return { toolName: this.name, success: true, output: content, durationMs: Date.now() - start };
      }

      if (args.action === 'write') {
        if (args.content === undefined) {
          return { toolName: this.name, success: false, output: '', error: 'Content is required for write action.' };
        }
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, args.content, 'utf8');
        const sandboxNote = context.sandboxLevel === 'wild' ? '' : ' (sandbox)';
        return {
          toolName: this.name,
          success: true,
          output: `File ${relativePath} written successfully${sandboxNote}.`,
          durationMs: Date.now() - start,
        };
      }

      return { toolName: this.name, success: false, output: '', error: `Unsupported action: ${args.action}` };
    } catch (error: any) {
      return { toolName: this.name, success: false, output: '', error: error.message };
    }
  }
}
