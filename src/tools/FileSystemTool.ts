import { Tool, ToolResult } from './Tool';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileSystemTool implements Tool {
  name: string = 'file_system';
  description: string = 'Provides utilities for reading and writing files in the project workspace.';
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async execute(args: { action: 'read' | 'write'; path: string; content?: string }): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceDir, args.path);

    // Basic security check: ensure path is within workspace
    if (!fullPath.startsWith(this.workspaceDir)) {
      return { toolName: this.name, success: false, output: '', error: `Access denied: Path ${args.path} is outside the workspace.` };
    }

    try {
      if (args.action === 'read') {
        const content = await fs.readFile(fullPath, 'utf8');
        return { toolName: this.name, success: true, output: content };
      } else if (args.action === 'write') {
        if (args.content === undefined) {
          return { toolName: this.name, success: false, output: '', error: 'Content is required for write action.' };
        }
        await fs.writeFile(fullPath, args.content, 'utf8');
        return { toolName: this.name, success: true, output: `File ${args.path} written successfully.` };
      } else {
        return { toolName: this.name, success: false, output: '', error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { toolName: this.name, success: false, output: '', error: error.message };
    }
  }
}
