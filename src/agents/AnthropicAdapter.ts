import { Agent, AgentOutput, AgentContext } from './Agent';
import { Message } from '../types/Message';
import { Anthropic } from '@anthropic-ai/sdk';

export class AnthropicAdapter implements Agent {
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
  private anthropic: Anthropic;

  constructor(config: {
    id: string; name: string; role: string; model: string; skills: string[]; scope: string; personality: string;
    level?: string; responsibilities?: string[]; costPerMinute?: number;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.model = config.model.startsWith('anthropic/') ? config.model.substring(10) : config.model;
    this.skills = config.skills;
    this.scope = config.scope;
    this.personality = config.personality;
    this.level = config.level;
    this.responsibilities = config.responsibilities;
    this.costPerMinute = config.costPerMinute;

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
    }
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  private getTools(): Anthropic.Tool[] {
    return [
      {
        name: 'file_system',
        description: 'Read or write files in the project workspace. Use workspace-relative paths.',
        input_schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['read', 'write'],
              description: 'The action to perform: read or write'
            },
            path: {
              type: 'string',
              description: 'Workspace-relative path to the file (e.g., "workspace/index.html")'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file (required for write action)'
            }
          },
          required: ['action', 'path']
        }
      },
      {
        name: 'terminal',
        description: 'Execute shell commands in the project workspace',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute'
            }
          },
          required: ['command']
        }
      }
    ];
  }

  private buildMessages(context: AgentContext): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    context.messages.forEach((msg: Message) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      if (msg.author.type === 'human') {
        messages.push({
          role: 'user',
          content: `${msg.author.name} (${msg.author.role}): ${content}`
        });
      } else {
        messages.push({
          role: 'assistant',
          content: `${msg.author.name} (${msg.author.role}): ${content}`
        });
      }
    });

    return messages;
  }

  async execute(context: AgentContext): Promise<AgentOutput> {
    const responsibilities = this.responsibilities?.length ? `Responsibilities: ${this.responsibilities.join(', ')}.` : '';
    const metadata = context.agentMetadata ? `\nSession Metadata: ${JSON.stringify(context.agentMetadata)}` : '';

    const systemPrompt = `You are ${this.name}, a ${this.role}${this.level ? ` (${this.level})` : ''}. Your skills include: ${this.skills.join(', ')}. Your scope of work is: ${this.scope}. Your personality is: ${this.personality}. ${responsibilities}

Project Specification:
${context.projectSpec}

Team Members:
${JSON.stringify(context.team.members.map((m: any) => ({ name: m.name, role: m.role, level: m.level, id: m.id })), null, 2)}

Your goal is to collaborate with the team to achieve the project objectives. Respond concisely and professionally.

IMPORTANT:
- Do not narrate other agents' actions or responses. Respond only as yourself.
- If you want another agent to perform a task or respond, explicitly mention them using their ID (e.g., @chloe-frontend, @bob-backend).
- Do not prefix or repeat your own name/role in the response; the system will annotate messages for you.
- Do not start your reply by naming another teammate; speak directly about the task.
- Use the provided tools (file_system, terminal) for file operations and commands.
- Use workspace-relative paths (e.g., "workspace/index.html").
${metadata}`;

    const messages = this.buildMessages(context);
    const topicId = context.messages[context.messages.length - 1]?.topicId || 'general';

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages,
        tools: this.getTools(),
      });

      // Check if Claude wants to use a tool
      const toolUseBlock = response.content.find(block => block.type === 'tool_use');

      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        const toolName = toolUseBlock.name;
        const toolInput = toolUseBlock.input as Record<string, any>;

        // Format as CALL_TOOL for Orchestrator to parse
        const toolCallContent = `CALL_TOOL: ${toolName}(${JSON.stringify(toolInput)})`;

        const newMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          topicId,
          author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
          timestamp: Date.now(),
          type: 'text',
          content: toolCallContent,
          metadata: {
            tool_use_id: toolUseBlock.id,
            native_tool_use: true,
            claude_powered: true
          }
        };

        return { message: newMessage };
      }

      // Regular text response
      const textBlock = response.content.find(block => block.type === 'text');
      const responseContent = textBlock && textBlock.type === 'text' ? textBlock.text : '';

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
      console.error(`Error in AnthropicAdapter for ${this.name}:`, error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId,
        author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
        timestamp: Date.now(),
        type: 'system',
        content: `Error: Failed to get response from Anthropic. ${error instanceof Error ? error.message : String(error)}`,
      };
      return { message: errorMessage };
    }
  }
}
