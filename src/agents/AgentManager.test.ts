import { AgentManager } from './AgentManager';
import { Agent } from './Agent';

// Mock the concrete agent adapters
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

// Import the mocked constructors to check if they were called
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GoogleGeminiAdapter } from './GoogleGeminiAdapter';

describe('AgentManager', () => {
  let agentManager: AgentManager;

  beforeEach(() => {
    agentManager = new AgentManager();
    // Clear mock calls before each test
    (OpenAIAdapter as jest.Mock).mockClear();
    (AnthropicAdapter as jest.Mock).mockClear();
    (GoogleGeminiAdapter as jest.Mock).mockClear();
  });

  it('should create an OpenAI agent correctly', () => {
    const config = {
      id: 'test-openai',
      name: 'TestAI',
      role: 'Developer',
      model: 'openai/gpt-4',
      skills: [],
      scope: '',
      personality: '',
    };
    const agent = agentManager.createAgent(config);
    expect(OpenAIAdapter).toHaveBeenCalledTimes(1);
    expect(agent.id).toBe('test-openai');
    expect(agent.name).toBe('TestAI');
  });

  it('should create an Anthropic agent correctly', () => {
    const config = {
      id: 'test-anthropic',
      name: 'TestClaude',
      role: 'Writer',
      model: 'anthropic/claude-3',
      skills: [],
      scope: '',
      personality: '',
    };
    const agent = agentManager.createAgent(config);
    expect(AnthropicAdapter).toHaveBeenCalledTimes(1);
    expect(agent.id).toBe('test-anthropic');
  });

  it('should create a Google Gemini agent correctly', () => {
    const config = {
      id: 'test-gemini',
      name: 'TestGemini',
      role: 'Analyst',
      model: 'google/gemini-pro',
      skills: [],
      scope: '',
      personality: '',
    };
    const agent = agentManager.createAgent(config);
    expect(GoogleGeminiAdapter).toHaveBeenCalledTimes(1);
    expect(agent.id).toBe('test-gemini');
  });

  it('should throw an error for an unsupported model', () => {
    const config = {
      id: 'test-unsupported',
      name: 'Unsupported',
      role: 'Unknown',
      model: 'unknown/model',
      skills: [],
      scope: '',
      personality: '',
    };
    expect(() => agentManager.createAgent(config)).toThrow('Unsupported agent model type: unknown/model');
  });

  it('should create a team of agents and assign IDs if missing', () => {
    const teamConfig = {
      teamName: 'Test Team',
      members: [
        { name: 'Agent1', role: 'Dev', model: 'openai/gpt-3.5', skills: [], scope: '', personality: '' },
        { id: 'agent2-id', name: 'Agent2', role: 'QA', model: 'anthropic/claude-2', skills: [], scope: '', personality: '' },
      ],
    };
    const agents = agentManager.createTeam(teamConfig);
    expect(agents.length).toBe(2);
    expect(OpenAIAdapter).toHaveBeenCalledTimes(1);
    expect(AnthropicAdapter).toHaveBeenCalledTimes(1);
    expect(agents[0].id).toMatch(/^agent1-\w{4}$/); // Auto-generated ID
    expect(agents[1].id).toBe('agent2-id');
    expect(agentManager.getAgents().length).toBe(2);
  });

  it('should retrieve agents by ID', () => {
    const teamConfig = {
      teamName: 'Test Team',
      members: [
        { id: 'agentA', name: 'AgentA', role: 'Dev', model: 'openai/gpt-3.5', skills: [], scope: '', personality: '' },
      ],
    };
    agentManager.createTeam(teamConfig);
    const agent = agentManager.getAgent('agentA');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('AgentA');
  });

  it('should return undefined for a non-existent agent ID', () => {
    const agent = agentManager.getAgent('non-existent');
    expect(agent).toBeUndefined();
  });
});
