import { Agent } from './Agent';
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GoogleGeminiAdapter } from './GoogleGeminiAdapter';
import { SimulatedAdapter } from './SimulatedAdapter';
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter';
import { GeminiCLIAdapter } from './GeminiCLIAdapter';
import { CodexCLIAdapter } from './CodexCLIAdapter';
import { TeamConfig, TeamMemberConfig } from '../types/Session';

const adapterRequirements: Record<string, { envKey: string; adapter: any }> = {
  // API-based adapters (original implementation)
  openai: { envKey: 'OPENAI_API_KEY', adapter: OpenAIAdapter },
  anthropic: { envKey: 'ANTHROPIC_API_KEY', adapter: AnthropicAdapter },
  google: { envKey: 'GOOGLE_API_KEY', adapter: GoogleGeminiAdapter },

  // CLI-based adapters (wrapper around external tools)
  'claude-code': { envKey: 'ANTHROPIC_API_KEY', adapter: ClaudeCodeAdapter },
  'gemini-cli': { envKey: 'GOOGLE_API_KEY', adapter: GeminiCLIAdapter },
  'codex-cli': { envKey: 'OPENAI_API_KEY', adapter: CodexCLIAdapter },
};

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private agentConfigs: Map<string, TeamMemberConfig> = new Map();
  private sandboxMode: 'strict' | 'guided' | 'wild' = 'guided';

  setSandboxMode(mode: 'strict' | 'guided' | 'wild'): void {
    this.sandboxMode = mode;
  }

  createAgent(agentConfig: TeamMemberConfig): Agent {
    const { id, name, role, model, skills = [], scope = '', personality = '', level, responsibilities, costPerMinute } = agentConfig;

    if (!id || !name || !role || !model) {
      throw new Error('Agent configuration missing required fields (id, name, role, model).');
    }

    const provider = model.split('/')[0];
    const requirement = adapterRequirements[provider];
    let agent: Agent;

    const baseConfig: any = {
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
      sandboxMode: this.sandboxMode,  // Pass sandbox mode to CLI agents
    };

    const cliProviders = new Set(['claude-code', 'gemini-cli', 'codex-cli']);
    if (cliProviders.has(provider)) {
      const binaryEnvMap: Record<string, string> = {
        'claude-code': 'CLAUDE_CLI_PATH',
        'gemini-cli': 'GEMINI_CLI_PATH',
        'codex-cli': 'CODEX_CLI_PATH',
      };

      const envBinaryPath = binaryEnvMap[provider] ? process.env[binaryEnvMap[provider]] : undefined;
      const resolvedBinaryPath = agentConfig.binaryPath || envBinaryPath;

      if (resolvedBinaryPath) {
        baseConfig.binaryPath = resolvedBinaryPath;
      }
    }

    if (requirement && process.env[requirement.envKey]) {
      agent = new requirement.adapter(baseConfig);
    } else if (requirement) {
      console.warn(`Missing API key ${requirement.envKey} for model ${model}. Falling back to simulated adapter.`);
      agent = new SimulatedAdapter({ id, name, role, model, skills, scope, personality, level, responsibilities, costPerMinute });
    } else {
      agent = new SimulatedAdapter({ id, name, role, model, skills, scope, personality, level, responsibilities, costPerMinute });
    }

    this.agents.set(id, agent);
    this.agentConfigs.set(id, { ...agentConfig, skills, scope, personality, responsibilities, binaryPath: agentConfig.binaryPath });
    return agent;
  }

  createTeam(teamConfig: TeamConfig): Agent[] {
    if (!teamConfig || !Array.isArray(teamConfig.members)) {
      throw new Error("Invalid team configuration: 'members' array is missing or invalid.");
    }

    // Set sandbox mode from team config
    if (teamConfig.sandbox) {
      this.setSandboxMode(teamConfig.sandbox);
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
