import { Message } from '../types/Message';

export interface AgentOutput {
  message: Message;
  // Potentially other outputs like file changes, tool calls, etc.
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  skills: string[];
  scope: string;
  personality: string;

  // The core method for an agent to process a task or message
  // context will include relevant messages, project state, etc.
  execute(context: { messages: Message[]; team: any; projectSpec: string; }): Promise<AgentOutput>;
}
