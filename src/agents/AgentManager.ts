import { Agent } from './Agent';
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GoogleGeminiAdapter } from './GoogleGeminiAdapter';

export class AgentManager {
  private agents: Map<string, Agent> = new Map();

  constructor() {}

  createAgent(agentConfig: any): Agent {
    const { id, name, role, model, skills, scope, personality } = agentConfig;

    if (!id || !name || !role || !model) {
      throw new Error("Agent configuration missing required fields (id, name, role, model).");
    }

    let agent: Agent;
    if (model.startsWith("openai/")) {
      agent = new OpenAIAdapter({ id, name, role, model, skills, scope, personality });
    } else if (model.startsWith("anthropic/")) {
      agent = new AnthropicAdapter({ id, name, role, model, skills, scope, personality });
    } else if (model.startsWith("google/")) {
      agent = new GoogleGeminiAdapter({ id, name, role, model, skills, scope, personality });
    } else {
      throw new Error(`Unsupported agent model type: ${model}`);
    }
    this.agents.set(id, agent);
    return agent;
  }

  createTeam(teamConfig: any): Agent[] {
    if (!teamConfig || !teamConfig.members || !Array.isArray(teamConfig.members)) {
      throw new Error("Invalid team configuration: 'members' array is missing or invalid.");
    }

    const createdAgents: Agent[] = [];
    for (const memberConfig of teamConfig.members) {
      // Assign a unique ID if not provided in config
      if (!memberConfig.id) {
        memberConfig.id = memberConfig.name.toLowerCase().replace(/\s/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
      }
      createdAgents.push(this.createAgent(memberConfig));
    }
    return createdAgents;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
}
