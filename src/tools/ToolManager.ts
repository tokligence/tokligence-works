import { Tool, ToolResult } from './Tool';
import { FileSystemTool } from './FileSystemTool';
import { TerminalTool } from './TerminalTool';

export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  constructor(workspaceDir: string) {
    this.registerTool(new FileSystemTool(workspaceDir));
    this.registerTool(new TerminalTool(workspaceDir));
    // Register other tools here as they are implemented
  }

  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool with name '${tool.name}' already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      return { toolName, success: false, output: '', error: `Tool '${toolName}' not found.` };
    }
    return tool.execute(args);
  }

  getToolDescriptions(): string {
    let descriptions = 'Available Tools:\n';
    this.tools.forEach(tool => {
      descriptions += `- ${tool.name}: ${tool.description}\n`;
    });
    return descriptions;
  }
}
