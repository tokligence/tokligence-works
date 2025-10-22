import { Agent, AgentContext, AgentOutput } from './Agent';
import { Message } from '../types/Message';

export class SimulatedAdapter implements Agent {
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

  constructor(config: {
    id: string; name: string; role: string; model: string; skills: string[]; scope: string; personality: string;
    level?: string; responsibilities?: string[]; costPerMinute?: number;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.model = config.model;
    this.skills = config.skills;
    this.scope = config.scope;
    this.personality = config.personality;
    this.level = config.level;
    this.responsibilities = config.responsibilities;
    this.costPerMinute = config.costPerMinute;
  }

  async execute(context: AgentContext): Promise<AgentOutput> {
    const topicId = context.messages[context.messages.length - 1]?.topicId || 'general';
    const lastMessage = context.messages[context.messages.length - 1];
    const acknowledgement = lastMessage
      ? `Received: ${this.truncateMessage(lastMessage.content)}. Will coordinate next steps.`
      : 'Starting on the requested work.';
    const syntheticContent = `SIMULATED RESPONSE: ${acknowledgement}`;

    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      topicId,
      author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
      timestamp: Date.now(),
      type: 'text',
      content: syntheticContent,
    };

    return { message };
  }

  private truncateMessage(content: Message['content']): string {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return text.length > 120 ? `${text.substring(0, 117)}...` : text;
  }
}
