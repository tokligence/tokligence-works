import { Agent, AgentOutput, AgentContext } from './Agent';
import { Message } from '../types/Message';
import OpenAI from 'openai';
import { PromptLoader } from '../prompts/PromptLoader';

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

  private getTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'file_system',
          description: 'Read or write files in the project workspace',
          parameters: {
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'terminal',
          description: 'Execute shell commands in the project workspace',
          parameters: {
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
      }
    ];
  }

  private buildPrompt(context: AgentContext): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const metadata = context.agentMetadata ? `\nSession Metadata: ${JSON.stringify(context.agentMetadata)}` : '';

    // Build system prompt using PromptLoader
    const systemPrompt = PromptLoader.buildSystemPrompt({
      name: this.name,
      role: this.role,
      level: this.level,
      skills: this.skills,
      scope: this.scope,
      personality: this.personality,
      responsibilities: this.responsibilities,
      projectSpec: context.projectSpec,
      teamMembers: context.team.members.map((m: any) => ({ name: m.name, role: m.role, level: m.level, id: m.id })),
      metadata,
    });

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
        tools: this.getTools(),
        tool_choice: 'auto',
        temperature: 0.7,
      });

      const responseMessage = chatCompletion.choices[0].message;
      const topicId = context.messages[context.messages.length - 1]?.topicId || 'general';

      // Check if there are tool calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolCall = responseMessage.tool_calls[0];

        // Check if this is a function call
        if (toolCall.type === 'function' && 'function' in toolCall) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          // Format as CALL_TOOL for Orchestrator to parse
          const toolCallContent = `CALL_TOOL: ${toolName}(${JSON.stringify(toolArgs)})`;

          const newMessage: Message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            topicId,
            author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
            timestamp: Date.now(),
            type: 'text',
            content: toolCallContent,
            metadata: {
              tool_call_id: toolCall.id,
              native_function_call: true
            }
          };

          return { message: newMessage };
        }
      }

      // Regular text response
      const responseContent = responseMessage.content || '';

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
