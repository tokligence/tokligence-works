import { Agent, AgentOutput } from './Agent';
import { Message } from '../types/Message';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GoogleGeminiAdapter implements Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  skills: string[];
  scope: string;
  personality: string;
  private genAI: GoogleGenerativeAI;

  constructor(config: {
    id: string; name: string; role: string; model: string; skills: string[]; scope: string; personality: string;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.model = config.model.startsWith('google/') ? config.model.substring(7) : config.model;
    this.skills = config.skills;
    this.scope = config.scope;
    this.personality = config.personality;

    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not set in environment variables.");
    }
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }

  private buildPrompt(context: { messages: Message[]; team: any; projectSpec: string; }): string {
    const systemPrompt = `You are ${this.name}, a ${this.role}. Your skills include: ${this.skills.join(', ')}. Your scope of work is: ${this.scope}. Your personality is: ${this.personality}.\n\nProject Specification:\n${context.projectSpec}\n\nTeam Members:\n${JSON.stringify(context.team.members.map((m: any) => ({ name: m.name, role: m.role, skills: m.skills })), null, 2)}\n\nYour goal is to collaborate with the team to achieve the project objectives. Respond concisely and professionally.\n\nIf you need to use a tool, respond in the format: CALL_TOOL: tool_name({"arg1": "value", "arg2": "value"}).\nAvailable tools are:\n- file_system: Provides utilities for reading and writing files in the project workspace. Actions: 'read' (args: {path: string}), 'write' (args: {path: string, content: string}).\n- terminal: Executes shell commands in the project workspace. Actions: 'execute' (args: {command: string}).\n\nExample tool call: CALL_TOOL: file_system({"action": "read", "path": "src/main.ts"})\nExample tool call: CALL_TOOL: terminal({"command": "ls -l"})\n\nOtherwise, respond with a text message.`;

    let conversation = '';
    context.messages.forEach(msg => {
      const authorName = msg.author.name;
      const authorRole = msg.author.role;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      if (msg.author.type === 'human') {
        conversation += `\nHuman (${authorName} - ${authorRole}): ${content}`;
      } else {
        conversation += `\nAssistant (${authorName} - ${authorRole}): ${content}`;
      }
    });

    return `${systemPrompt}\n${conversation}\nAssistant (${this.name} - ${this.role}):`;
  }

  async execute(context: { messages: Message[]; team: any; projectSpec: string; }): Promise<AgentOutput> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const prompt = this.buildPrompt(context);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseContent = response.text();

      const newMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId: context.messages[context.messages.length - 1]?.topicId || 'general',
        author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
        timestamp: Date.now(),
        type: 'text',
        content: responseContent,
      };

      return { message: newMessage };

    } catch (error) {
      console.error(`Error in GoogleGeminiAdapter for ${this.name}:`, error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId: context.messages[context.messages.length - 1]?.topicId || 'general',
        author: { id: this.id, name: this.name, role: this.role, type: 'agent' },
        timestamp: Date.now(),
        type: 'system',
        content: `Error: Failed to get response from Google Gemini. ${error instanceof Error ? error.message : String(error)}`,
      };
      return { message: errorMessage };
    }
  }
}
