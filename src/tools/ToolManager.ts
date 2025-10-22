import { FileSystemTool } from './FileSystemTool';
import { TerminalTool } from './TerminalTool';
import { Tool, ToolResult, ToolContext } from './Tool';
import { SandboxLevel } from '../types/Session';

export interface ExecuteToolOptions {
  sandboxLevel: SandboxLevel;
}

export class ToolService {
  private tools: Map<string, Tool> = new Map();
  private auditTrail: ToolResult[] = [];

  constructor(private workspaceDir: string) {
    this.registerTool(new FileSystemTool(workspaceDir));
    this.registerTool(new TerminalTool(workspaceDir));
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

  async executeTool(toolName: string, args: Record<string, any>, options: ExecuteToolOptions): Promise<ToolResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      return { toolName, success: false, output: '', error: `Tool '${toolName}' not found.` };
    }

    const context: ToolContext = { sandboxLevel: options.sandboxLevel };
    const result = await tool.execute(args, context);
    this.auditTrail.push(result);
    return result;
  }

  getToolDescriptions(): string {
    let descriptions = 'Available Tools:\n';
    this.tools.forEach((tool) => {
      descriptions += `- ${tool.name}: ${tool.description}\n`;
    });
    return descriptions.trimEnd();
  }

  getAuditTrail(): ToolResult[] {
    return [...this.auditTrail];
  }
}
