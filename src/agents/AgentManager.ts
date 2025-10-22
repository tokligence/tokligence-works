import { Agent } from './Agent';
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GoogleGeminiAdapter } from './GoogleGeminiAdapter';
import { SimulatedAdapter } from './SimulatedAdapter';
import { TeamConfig, TeamMemberConfig } from '../types/Session';

const adapterRequirements: Record<string, { envKey: string; adapter: any }> = {
  openai: { envKey: 'OPENAI_API_KEY', adapter: OpenAIAdapter },
  anthropic: { envKey: 'ANTHROPIC_API_KEY', adapter: AnthropicAdapter },
  google: { envKey: 'GOOGLE_API_KEY', adapter: GoogleGeminiAdapter },
};

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private agentConfigs: Map<string, TeamMemberConfig> = new Map();

  createAgent(agentConfig: TeamMemberConfig): Agent {
    const { id, name, role, model, skills = [], scope = '', personality = '', level, responsibilities, costPerMinute } = agentConfig;

    if (!id || !name || !role || !model) {
      throw new Error('Agent configuration missing required fields (id, name, role, model).');
    }

    const provider = model.split('/')[0];
    const requirement = adapterRequirements[provider];
    let agent: Agent;

    if (requirement && process.env[requirement.envKey]) {
      agent = new requirement.adapter({
        id,
        name,
        role,
        model,
        skills,
        scope,
        personality,
        level,
        responsibilities,
        costPerMinute,
      });
    } else if (requirement) {
      console.warn(`Missing API key ${requirement.envKey} for model ${model}. Falling back to simulated adapter.`);
      agent = new SimulatedAdapter({ id, name, role, model, skills, scope, personality, level, responsibilities, costPerMinute });
    } else {
      agent = new SimulatedAdapter({ id, name, role, model, skills, scope, personality, level, responsibilities, costPerMinute });
    }

    this.agents.set(id, agent);
    this.agentConfigs.set(id, { ...agentConfig, skills, scope, personality, responsibilities });
    return agent;
  }

  createTeam(teamConfig: TeamConfig): Agent[] {
    if (!teamConfig || !Array.isArray(teamConfig.members)) {
      throw new Error("Invalid team configuration: 'members' array is missing or invalid.");
    }

    const createdAgents: Agent[] = [];
    for (const memberConfig of teamConfig.members) {
      const agentId = memberConfig.id || `${memberConfig.name.toLowerCase().replace(/\s/g, '-')}-${Math.random().toString(36).substring(2, 6)}`;
      const enrichedConfig: TeamMemberConfig = { ...memberConfig, id: agentId };
      createdAgents.push(this.createAgent(enrichedConfig));
    }
    return createdAgents;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  replaceWithSimulated(agentId: string): Agent | undefined {
    const config = this.agentConfigs.get(agentId);
    if (!config) {
      return undefined;
    }
    const { name, role, model, skills = [], scope = '', personality = '', level, responsibilities, costPerMinute } = config;
    const simulated = new SimulatedAdapter({
      id: agentId,
      name,
      role,
      model,
      skills,
      scope,
      personality,
      level,
      responsibilities,
      costPerMinute,
    });
    this.agents.set(agentId, simulated);
    return simulated;
  }
}
