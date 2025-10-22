import { AgentManager } from './AgentManager';

jest.mock('./OpenAIAdapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation((config) => ({
    ...config,
    execute: jest.fn(),
    id: config.id || 'mock-openai-id',
  })),
}));

jest.mock('./AnthropicAdapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation((config) => ({
    ...config,
    execute: jest.fn(),
    id: config.id || 'mock-anthropic-id',
  })),
}));

jest.mock('./GoogleGeminiAdapter', () => ({
  GoogleGeminiAdapter: jest.fn().mockImplementation((config) => ({
    ...config,
    execute: jest.fn(),
    id: config.id || 'mock-gemini-id',
  })),
}));

jest.mock('./SimulatedAdapter', () => ({
  SimulatedAdapter: jest.fn().mockImplementation((config) => ({
    ...config,
    execute: jest.fn(),
    id: config.id || 'simulated-id',
  })),
}));

jest.mock('./CodexCLIAdapter', () => ({
  CodexCLIAdapter: jest.fn().mockImplementation((config) => ({
    ...config,
    execute: jest.fn(),
    id: config.id || 'mock-codex-id',
  })),
}));

import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GoogleGeminiAdapter } from './GoogleGeminiAdapter';
import { SimulatedAdapter } from './SimulatedAdapter';
import { CodexCLIAdapter } from './CodexCLIAdapter';

describe('AgentManager', () => {
  let agentManager: AgentManager;

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    process.env.GOOGLE_API_KEY = 'test-google';
    delete process.env.CODEX_CLI_PATH;
    delete process.env.CLAUDE_CLI_PATH;
    delete process.env.GEMINI_CLI_PATH;

    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    agentManager = new AgentManager();

    (OpenAIAdapter as jest.Mock).mockClear();
    (AnthropicAdapter as jest.Mock).mockClear();
    (GoogleGeminiAdapter as jest.Mock).mockClear();
    (SimulatedAdapter as jest.Mock).mockClear();
    (CodexCLIAdapter as jest.Mock).mockClear();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.CODEX_CLI_PATH;
    delete process.env.CLAUDE_CLI_PATH;
    delete process.env.GEMINI_CLI_PATH;
    warnSpy.mockRestore();
  });

  it('creates an OpenAI agent when key is present', () => {
    const config = {
      id: 'test-openai',
      name: 'TestAI',
      role: 'Developer',
      model: 'openai/gpt-4',
      skills: [],
      scope: '',
      personality: '',
    };
    const agent = agentManager.createAgent(config as any);
    expect(OpenAIAdapter).toHaveBeenCalledTimes(1);
    expect(agent.id).toBe('test-openai');
  });

  it('falls back to simulated adapter when OpenAI key missing', () => {
    delete process.env.OPENAI_API_KEY;
    const config = {
      id: 'fallback-openai',
      name: 'FallbackAI',
      role: 'Developer',
      model: 'openai/gpt-4',
      skills: [],
      scope: '',
      personality: '',
    };
    const agent = agentManager.createAgent(config as any);
    expect(SimulatedAdapter).toHaveBeenCalledTimes(1);
    expect(agent.id).toBe('fallback-openai');
  });

  it('creates an Anthropic agent when key is present', () => {
    const config = {
      id: 'test-anthropic',
      name: 'TestClaude',
      role: 'Writer',
      model: 'anthropic/claude-3',
      skills: [],
      scope: '',
      personality: '',
    };
    agentManager.createAgent(config as any);
    expect(AnthropicAdapter).toHaveBeenCalledTimes(1);
  });

  it('creates a Google Gemini agent when key is present', () => {
    const config = {
      id: 'test-gemini',
      name: 'TestGemini',
      role: 'Analyst',
      model: 'google/gemini-pro',
      skills: [],
      scope: '',
      personality: '',
    };
    agentManager.createAgent(config as any);
    expect(GoogleGeminiAdapter).toHaveBeenCalledTimes(1);
  });

  it('falls back to simulated adapter for unknown provider', () => {
    const config = {
      id: 'unknown-agent',
      name: 'Unknown',
      role: 'Explorer',
      model: 'custom/model',
      skills: [],
      scope: '',
      personality: '',
    };
    agentManager.createAgent(config as any);
    expect(SimulatedAdapter).toHaveBeenCalledTimes(1);
  });

  it('creates a team of agents and assigns IDs if missing', () => {
    const teamConfig = {
      teamName: 'Test Team',
      mode: 'time',
      sandbox: 'guided',
      members: [
        { name: 'Agent1', role: 'Dev', model: 'openai/gpt-3.5', skills: [], scope: '', personality: '' },
        { id: 'agent2-id', name: 'Agent2', role: 'QA', model: 'anthropic/claude-2', skills: [], scope: '', personality: '' },
      ],
    };
    const agents = agentManager.createTeam(teamConfig as any);
    expect(agents.length).toBe(2);
    expect(OpenAIAdapter).toHaveBeenCalledTimes(1);
    expect(AnthropicAdapter).toHaveBeenCalledTimes(1);
    expect(agents[0].id).toMatch(/^agent1-\w{4}$/);
    expect(agents[1].id).toBe('agent2-id');
  });

  it('can replace an agent with a simulated adapter', () => {
    const config = {
      id: 'agent-swap',
      name: 'SwapAgent',
      role: 'Developer',
      model: 'openai/gpt-4',
      skills: [],
      scope: '',
      personality: '',
    };
    agentManager.createAgent(config as any);
    const simulated = agentManager.replaceWithSimulated('agent-swap');
    expect(simulated).toBeDefined();
    expect(simulated?.execute).toBeDefined();
  });

  it('passes binaryPath to CLI adapters', () => {
    const config = {
      id: 'codex-cli-agent',
      name: 'CodexCLI',
      role: 'Developer',
      model: 'codex-cli/davinci',
      skills: [],
      scope: '',
      personality: '',
      binaryPath: '/opt/homebrew/bin/codex',
    };

    agentManager.createAgent(config as any);

    expect(CodexCLIAdapter).toHaveBeenCalledTimes(1);
    expect(CodexCLIAdapter).toHaveBeenCalledWith(expect.objectContaining({
      binaryPath: config.binaryPath,
    }));
  });

  it('uses environment overrides for CLI binary paths when explicit value not provided', () => {
    process.env.CODEX_CLI_PATH = '/opt/homebrew/bin/codex';

    const config = {
      id: 'codex-cli-env-agent',
      name: 'CodexCLIEnv',
      role: 'Developer',
      model: 'codex-cli/davinci',
      skills: [],
      scope: '',
      personality: '',
    };

    agentManager.createAgent(config as any);

    expect(CodexCLIAdapter).toHaveBeenCalledTimes(1);
    expect(CodexCLIAdapter).toHaveBeenCalledWith(expect.objectContaining({
      binaryPath: '/opt/homebrew/bin/codex',
    }));
  });
});
