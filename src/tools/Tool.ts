import { SandboxLevel } from '../types/Session';

export interface ToolResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs?: number;
}

export interface ToolContext {
  sandboxLevel: SandboxLevel;
}

export interface Tool {
  name: string;
  description: string;
  execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult>;
}
