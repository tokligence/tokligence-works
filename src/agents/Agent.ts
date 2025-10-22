import { Message } from '../types/Message';
import { TeamConfig } from '../types/Session';

export interface AgentOutput {
  message: Message;
}

export interface AgentContext {
  messages: Message[];
  team: TeamConfig;
  projectSpec: string;
  agentMetadata?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  skills: string[];
  scope: string;
  personality: string;
  level?: string;
  responsibilities?: string[];
  costPerMinute?: number;

  execute(context: AgentContext): Promise<AgentOutput>;
}
