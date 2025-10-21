import { Agent, AgentOutput } from './Agent';
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
  private openai: OpenAI;

  constructor(config: {
    id: string; name: string; role: string; model: string; skills: string[]; scope: string; personality: string;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.model = config.model.startsWith('openai/') ? config.model.substring(7) : config.model;
    this.skills = config.skills;
    this.scope = config.scope;
    this.personality = config.personality;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set in environment variables.");
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private buildPrompt(context: { messages: Message[]; team: any; projectSpec: string; }): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const systemPrompt = `You are ${this.name}, a ${this.role}. Your skills include: ${this.skills.join(', ')}. Your scope of work is: ${this.scope}. Your personality is: ${this.personality}.\n\nProject Specification:\n${context.projectSpec}\n\nTeam Members:\n${JSON.stringify(context.team.members.map((m: any) => ({ name: m.name, role: m.role, skills: m.skills })), null, 2)}\n\nYour goal is to collaborate with the team to achieve the project objectives. Respond concisely and professionally.\n\nIf you need to use a tool, respond in the format: CALL_TOOL: tool_name({"arg1": "value", "arg2": "value"}).\nAvailable tools are:\n- file_system: Provides utilities for reading and writing files in the project workspace. Actions: 'read' (args: {path: string}), 'write' (args: {path: string, content: string}).\n- terminal: Executes shell commands in the project workspace. Actions: 'execute' (args: {command: string}).\n\nExample tool call: CALL_TOOL: file_system({"action": "read", "path": "src/main.ts"})\nExample tool call: CALL_TOOL: terminal({"command": "ls -l"})\n\nOtherwise, respond with a text message.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    context.messages.forEach(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (msg.author.type === 'human') {
        messages.push({ role: 'user', content: `${msg.author.name} (${msg.author.role}): ${content}` });
      } else {
        messages.push({ role: 'assistant', content: `${msg.author.name} (${msg.author.role}): ${content}` });
      }
    });

    return messages;
  }

  async execute(context: { messages: Message[]; team: any; projectSpec: string; }): Promise<AgentOutput> {
    const promptMessages = this.buildPrompt(context);

    try {
      const chatCompletion = await this.openai.chat.completions.create({
        model: this.model,
        messages: promptMessages,
        temperature: 0.7,
      });

      const responseContent = chatCompletion.choices[0].message.content || '';

      const newMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId: context.messages[context.messages.length - 1]?.topicId || 'general', // Infer topic from last message or default
        author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
        timestamp: Date.now(),
        type: 'text',
        content: responseContent,
      };

      return { message: newMessage };

    } catch (error) {
      console.error(`Error in OpenAIAdapter for ${this.name}:`, error);
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
