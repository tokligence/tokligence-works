export interface ToolResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  execute(args: Record<string, any>): Promise<ToolResult>;
}
