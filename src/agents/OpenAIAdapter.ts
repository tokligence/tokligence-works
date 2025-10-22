import { Agent, AgentOutput, AgentContext } from './Agent';
import { Message } from '../types/Message';
import OpenAI from 'openai';

export class OpenAIAdapter implements Agent {
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
  private openai: OpenAI;

  constructor(config: {
    id: string; name: string; role: string; model: string; skills: string[]; scope: string; personality: string;
    level?: string; responsibilities?: string[]; costPerMinute?: number;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.model = config.model.startsWith('openai/') ? config.model.substring(7) : config.model;
    this.skills = config.skills;
    this.scope = config.scope;
    this.personality = config.personality;
    this.level = config.level;
    this.responsibilities = config.responsibilities;
    this.costPerMinute = config.costPerMinute;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables.');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private buildPrompt(context: AgentContext): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const responsibilities = this.responsibilities?.length ? `Responsibilities: ${this.responsibilities.join(', ')}.` : '';
    const metadata = context.agentMetadata ? `\nSession Metadata: ${JSON.stringify(context.agentMetadata)}` : '';

    const systemPrompt = `You are ${this.name}, a ${this.role}${this.level ? ` (${this.level})` : ''}. Your skills include: ${this.skills.join(', ')}. Your scope of work is: ${this.scope}. Your personality is: ${this.personality}. ${responsibilities}\n\nProject Specification:\n${context.projectSpec}\n\nTeam Members:\n${JSON.stringify(context.team.members.map((m: any) => ({ name: m.name, role: m.role, level: m.level, id: m.id })), null, 2)}\n\nYour goal is to collaborate with the team to achieve the project objectives. Respond concisely and professionally.\nIMPORTANT: Do not narrate other agents' actions or responses. Respond only as yourself. If you want another agent to perform a task or respond, explicitly mention them using their ID (e.g., @chloe-fe).\nDo not prefix or repeat your own name/role in the response; the system will annotate messages for you.
Do not start your reply by naming another teammate; speak directly about the task.

If you need to use a tool, respond in the format: CALL_TOOL: tool_name({"command": "value"}).
For file operations include an explicit "action" field (e.g., {"action": "write"}); do not use dot notation like file_system.write. Use workspace-relative paths (e.g., "workspace/index.html").
${metadata}`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    context.messages.forEach((msg: Message) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (msg.author.type === 'human') {
        messages.push({ role: 'user', content: `${msg.author.name} (${msg.author.role}): ${content}` });
      } else {
        messages.push({ role: 'assistant', content: `${msg.author.name} (${msg.author.role}): ${content}` });
      }
    });

    return messages;
  }

  async execute(context: AgentContext): Promise<AgentOutput> {
    const promptMessages = this.buildPrompt(context);

    try {
      const chatCompletion = await this.openai.chat.completions.create({
        model: this.model,
        messages: promptMessages,
        temperature: 0.7,
      });

      const responseContent = chatCompletion.choices[0].message.content || '';

      const topicId = context.messages[context.messages.length - 1]?.topicId || 'general';

      const newMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId,
        author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
        timestamp: Date.now(),
        type: 'text',
        content: responseContent,
      };

      return { message: newMessage };

    } catch (error) {
      const errorMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId: context.messages[context.messages.length - 1]?.topicId || 'general',
        author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
        timestamp: Date.now(),
        type: 'system',
        content: `Error: Failed to get response from OpenAI. ${error instanceof Error ? error.message : String(error)}`,
      };
      return { message: errorMessage };
    }
  }
}
