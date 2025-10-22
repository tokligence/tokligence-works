import EventEmitter from 'events';
import { Agent, AgentOutput } from '../agents/Agent';
import { AgentManager } from '../agents/AgentManager';
import { SessionManager } from '../session/SessionManager';
import { Scheduler } from '../scheduler/Scheduler';
import { ToolService } from '../tools/ToolManager';
import { Message, ToolOutputContent } from '../types/Message';
import { ToolResult } from '../tools/Tool';
import {
  ConversationEvent,
  DeliveryMode,
  SandboxLevel,
  ScheduledTask,
  SessionOptions,
  TeamConfig,
  TeamMemberConfig,
} from '../types/Session';

const DEFAULT_MODE: DeliveryMode = 'time';
const DEFAULT_SANDBOX: SandboxLevel = 'guided';

export class Orchestrator extends EventEmitter {
  private agentManager = new AgentManager();
  private toolService: ToolService;
  private agents: Agent[] = [];
  private sessionManager!: SessionManager;
  private scheduler!: Scheduler;
  private processing = false;
  private teamConfig: TeamConfig;
  private projectSpec: string;
  private lastAgentMessages: Map<string, string> = new Map();
  private simulatedFallback: Set<string> = new Set();
  private awaitingHumanInput = false;

  constructor(teamConfig: any, projectSpec: string, workspaceDir: string) {
    super();
    this.teamConfig = this.normalizeTeamConfig(teamConfig);
    this.projectSpec = projectSpec;
    this.toolService = new ToolService(workspaceDir);
  }

  async initialize(): Promise<void> {
    this.agents = this.agentManager.createTeam(this.teamConfig);
    if (this.agents.length === 0) {
      throw new Error('No agents were created from the team configuration.');
    }

    const options: SessionOptions = {
      mode: this.teamConfig.mode || DEFAULT_MODE,
      sandbox: this.teamConfig.sandbox || DEFAULT_SANDBOX,
    };

    this.sessionManager = new SessionManager(`session-${Date.now()}`, this.teamConfig, this.projectSpec, options);
    this.scheduler = new Scheduler(this.teamConfig);

    const teamLead = this.findTeamLead();
    if (!teamLead) {
      throw new Error('No Team Lead agent found in the team configuration.');
    }

    const initialMessage: Message = {
      id: `msg-${Date.now()}-init`,
      topicId: 'general',
      author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
      timestamp: Date.now(),
      type: 'system',
      content: `Project initialized. ${teamLead.name}, please review the specification and plan the work. Modes: mode=${options.mode}, sandbox=${options.sandbox}. Available tools: ${this.toolService.getToolDescriptions()}`,
    };

    this.recordMessageEvent(initialMessage);
    this.emit('message', initialMessage);

    this.scheduler.scheduleInitialTurn('general');
    await this.runLoop();
  }

  async handleHumanInput(input: string, topicId: string = 'general'): Promise<void> {
    const trimmed = input.trim();
    if (trimmed.length === 0 && !this.awaitingHumanInput) {
      return;
    }

    if (trimmed.length > 0) {
      this.awaitingHumanInput = false;
    }
    const humanMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      topicId,
      author: { id: 'human', name: 'You', role: 'User', type: 'human' },
      timestamp: Date.now(),
      type: 'text',
      content: input,
    };
    this.recordMessageEvent(humanMessage);
    this.emit('message', humanMessage);

    const teamLead = this.findTeamLead();
    if (teamLead) {
      this.scheduler.enqueue({
        type: 'agent_turn',
        agentId: teamLead.id,
        topicId,
        reason: 'human',
        timestamp: Date.now(),
      });
    }
    await this.runLoop();
  }

  private async runLoop(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    while (this.scheduler.hasPendingTasks()) {
      const task = this.scheduler.dequeue();
      if (!task) {
        break;
      }
      await this.handleTask(task);
    }

    this.processing = false;
  }

  private async handleTask(task: ScheduledTask): Promise<void> {
    if (task.type === 'agent_turn') {
      const agent = this.agentManager.getAgent(task.agentId);
      if (!agent) {
        return;
      }
      this.emit('agentThinking', { agentId: agent.id, agentName: agent.name, topicId: task.topicId });
      const context = this.buildAgentContext(agent, task.topicId);
      let agentOutput: AgentOutput;
      try {
        agentOutput = await agent.execute(context);
      } catch (error) {
        const errorMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          topicId: task.topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: Date.now(),
          type: 'system',
          content: `Error executing agent ${agent.name}: ${error instanceof Error ? error.message : String(error)}`,
        };
        this.recordMessageEvent(errorMessage);
        this.emit('message', errorMessage);
        return;
      }
      await this.processAgentOutput(agent, agentOutput.message, task);
    }
  }

  private async processAgentOutput(agent: Agent, message: Message, task: ScheduledTask): Promise<void> {
    const normalizedMessage = this.ensureMessageProps(message, agent, task.topicId);

    const contentString = typeof normalizedMessage.content === 'string'
      ? normalizedMessage.content
      : JSON.stringify(normalizedMessage.content);
    const mentions = this.extractMentions(contentString);
    if (mentions.length > 0) {
      normalizedMessage.mentions = mentions;
    }

    if (typeof normalizedMessage.content === 'string') {
      const sanitized = this.sanitizeAgentContent(agent, normalizedMessage.content);
      if (!sanitized) {
        this.handleRepeatedMessage(agent, '(empty response after sanitization)', task.topicId);
        return;
      }
      normalizedMessage.content = sanitized;

      const lastMessage = this.lastAgentMessages.get(agent.id);
      if (lastMessage === sanitized) {
        this.handleRepeatedMessage(agent, sanitized, task.topicId);
        return;
      }
      this.lastAgentMessages.set(agent.id, sanitized);

      if (sanitized.toLowerCase().startsWith('error:')) {
        await this.handleAgentError(agent, sanitized, task.topicId);
        return;
      }
    }

    this.awaitingHumanInput = false;

    this.recordMessageEvent(normalizedMessage);
    this.emit('message', normalizedMessage);

    const toolCallPattern = /^CALL_TOOL:\s*([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\((.*)\)\s*;?$/;
    const match = contentString.match(toolCallPattern);

    if (match) {
      const toolName = match[1];
      const derivedAction = match[2];
      const argsString = match[3];
      let args: Record<string, any> = {};
      try {
        const trimmedArgs = argsString ? argsString.trim() : '';
        args = trimmedArgs ? JSON.parse(trimmedArgs) : {};
      } catch (error) {
        const parseErrorMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          topicId: task.topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: Date.now(),
          type: 'system',
          content: `Error parsing tool arguments for ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        };
        this.recordMessageEvent(parseErrorMessage);
        this.emit('message', parseErrorMessage);
        this.scheduler.enqueue({
          type: 'agent_turn',
          agentId: agent.id,
          topicId: task.topicId,
          reason: 'followup',
          timestamp: Date.now(),
        });
        return;
      }

      if (derivedAction && typeof args === 'object' && !('action' in args)) {
        args.action = derivedAction;
      }

      this.emit('toolCalling', { agentId: agent.id, agentName: agent.name, toolName, args });
      const toolResult = await this.toolService.executeTool(toolName, args, { sandboxLevel: this.getSandboxLevel() });

      const toolOutput: ToolOutputContent = {
        toolName: toolResult.toolName,
        success: toolResult.success,
        output: toolResult.output,
        error: toolResult.error,
        durationMs: toolResult.durationMs,
      };

      const toolOutputMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId: task.topicId,
        author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
        timestamp: Date.now(),
        type: 'tool_output',
        content: toolOutput,
      };
      this.recordToolEvent(toolResult, task.topicId);
      this.emit('message', toolOutputMessage);

      // After tool execution, provide guidance based on success and agent role
      const isTeamLead = (agent.role || '').toLowerCase().includes('team lead') || (agent.role || '').toLowerCase().includes('lead');

      if (!toolResult.success) {
        // Tool failed - agent should retry or report error
        const errorGuidance: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          topicId: task.topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: Date.now() + 1,
          type: 'system',
          content: `${agent.name}, the tool execution failed. Please review the error and either retry with corrections or report the issue to the Team Lead.`,
        };
        this.recordMessageEvent(errorGuidance);
        this.emit('message', errorGuidance);

        this.scheduler.enqueue({
          type: 'agent_turn',
          agentId: agent.id,
          topicId: task.topicId,
          reason: 'followup',
          timestamp: Date.now() + 2,
        });
      } else {
        // Tool succeeded - prompt agent to report completion
        if (!isTeamLead) {
          const reportGuidance: Message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            topicId: task.topicId,
            author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
            timestamp: Date.now() + 1,
            type: 'system',
            content: `${agent.name}, the tool executed successfully. Please report your completion to the Team Lead using @mention and describe what you accomplished.`,
          };
          this.recordMessageEvent(reportGuidance);
          this.emit('message', reportGuidance);
        }

        this.scheduler.enqueue({
          type: 'agent_turn',
          agentId: agent.id,
          topicId: task.topicId,
          reason: 'followup',
          timestamp: Date.now() + 2,
        });
      }
      await this.runLoop();
      return;
    }

    if (mentions.length > 0) {
      this.scheduler.scheduleMentions(task.topicId, mentions);
    } else if ((agent.role || '').toLowerCase().includes('team lead')) {
      // Team lead without mention; wait for human input or follow-up
    } else {
      this.scheduler.routeBackToLead(task.topicId, agent.id);
    }

    this.scheduler.scheduleReviewIfNeeded(task.topicId, agent.id);
    await this.runLoop();
  }

  private recordMessageEvent(message: Message): void {
    const event: ConversationEvent = {
      kind: message.author.type === 'human' ? 'human_input' : 'message',
      authorId: message.author.id,
      topicId: message.topicId,
      body: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      mentions: message.mentions,
      level: this.getAgentLevel(message.author.id),
      role: message.author.role,
      name: message.author.name,
      timestamp: message.timestamp,
    };
    this.sessionManager.appendEvent(event);
  }

  private recordToolEvent(result: ToolResult, topicId: string): void {
    const event: ConversationEvent = {
      kind: 'tool_result',
      topicId,
      result,
      timestamp: Date.now(),
    };
    this.sessionManager.appendEvent(event);
  }

  private buildAgentContext(agent: Agent, topicId: string) {
    const events = this.sessionManager.getRecentEvents(topicId, 20);
    const messages: Message[] = events
      .filter((event) => event.kind === 'message' || event.kind === 'human_input')
      .map((event) => this.eventToMessage(event));

    return {
      messages,
      team: this.teamConfig,
      projectSpec: this.projectSpec,
      agentMetadata: {
        level: this.getAgentLevel(agent.id),
        mode: this.teamConfig.mode || DEFAULT_MODE,
        sandbox: this.getSandboxLevel(),
      },
    };
  }

  private eventToMessage(event: ConversationEvent): Message {
    switch (event.kind) {
      case 'human_input':
        return {
          id: `msg-${event.timestamp}-${event.authorId}`,
          topicId: event.topicId,
          author: { id: event.authorId, name: event.name, role: event.role, type: 'human' },
          timestamp: event.timestamp,
          type: 'text',
          content: event.body,
        };
      case 'message':
        return {
          id: `msg-${event.timestamp}-${event.authorId}`,
          topicId: event.topicId,
          author: { id: event.authorId, name: event.name, role: event.role, type: 'agent' },
          timestamp: event.timestamp,
          type: 'text',
          content: event.body,
        };
      case 'tool_result':
        return {
          id: `msg-${event.timestamp}-tool`,
          topicId: event.topicId,
          author: { id: 'system', name: 'System', role: 'Tool Output', type: 'agent' },
          timestamp: event.timestamp,
          type: 'tool_output',
          content: event.result,
        };
      case 'handoff':
        return {
          id: `msg-${event.timestamp}-handoff`,
          topicId: event.topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: event.timestamp,
          type: 'system',
          content: `Handoff from ${event.from} to ${event.to}: ${event.reason}`,
        };
      case 'status':
        return {
          id: `msg-${event.timestamp}-status`,
          topicId: event.topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: event.timestamp,
          type: 'status_update',
          content: `Status changed to ${event.status}`,
        };
      case 'tool_call':
        return {
          id: `msg-${event.timestamp}-toolcall`,
          topicId: event.topicId,
          author: { id: event.agentId, name: 'Tool Call', role: 'Tool Invocation', type: 'agent' },
          timestamp: event.timestamp,
          type: 'system',
          content: `Tool ${event.tool} called with args ${JSON.stringify(event.args)}`,
        };
      default:
        return {
          id: `msg-${Date.now()}-system`,
          topicId: 'general',
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: Date.now(),
          type: 'system',
          content: 'Unsupported event in context.',
        };
    }
  }

  private ensureMessageProps(message: Message, agent: Agent, topicId: string): Message {
    return {
      ...message,
      topicId: message.topicId || topicId,
      author: message.author || { id: agent.id, name: agent.name, role: agent.role, type: 'agent' },
      timestamp: message.timestamp || Date.now(),
      type: message.type || 'text',
    };
  }

  private extractMentions(content: string): string[] {
    const mentionPattern = /@([a-zA-Z0-9_-]+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(content)) !== null) {
      if (this.agentManager.getAgent(match[1])) {
        mentions.push(match[1]);
      }
    }
    return mentions;
  }

  private getAgentLevel(agentId: string): import('../types/Session').AgentLevel | undefined {
    const member = this.teamConfig.members.find((m) => m.id === agentId);
    return member?.level;
  }

  private findTeamLead(): TeamMemberConfig | undefined {
    return this.teamConfig.members.find((member) => /team lead/i.test(member.role)) || this.teamConfig.members[0];
  }

  private sanitizeAgentContent(agent: Agent, content: string): string {
    const lines = content.split(/\r?\n/);
    const cleanedLines: string[] = [];

    const escapedName = agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedRole = agent.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const selfPrefix = new RegExp(`^${escapedName}(?:\\s*\\(${escapedRole}\\))?:\\s*`, 'i');
    const systemPrefix = /^System(?: \(Orchestrator\))?:\s*/i;

    const otherAgentPrefix = this.agents
      .filter((a) => a.id !== agent.id)
      .map((a) => a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const otherPrefixRegex = otherAgentPrefix
      ? new RegExp(`^(?:${otherAgentPrefix})(?:\\s*\\([^)]+\\))?:\\s*`, 'i')
      : null;

    for (let rawLine of lines) {
      let line = rawLine.trimStart();
      if (!line) {
        cleanedLines.push('');
        continue;
      }

      line = line.replace(systemPrefix, '').replace(selfPrefix, '');
      if (otherPrefixRegex) {
        line = line.replace(otherPrefixRegex, '');
      }

      cleanedLines.push(line.trimStart());
    }

    const result = cleanedLines.join('\n').trim();
    return result;
  }

  requiresHumanInput(): boolean {
    return this.awaitingHumanInput;
  }

  hasPendingTasks(): boolean {
    return this.scheduler ? this.scheduler.hasPendingTasks() : false;
  }

  private handleRepeatedMessage(agent: Agent, content: string, topicId: string): void {
    const systemMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      topicId,
      author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
      timestamp: Date.now(),
      type: 'system',
      content: `Agent ${agent.name} repeated the same response. Human guidance is required to proceed. Last response: ${content}`,
    };
    this.recordMessageEvent(systemMessage);
    this.emit('message', systemMessage);
    this.awaitingHumanInput = true;
  }

  private async handleAgentError(agent: Agent, content: string, topicId: string): Promise<void> {
    const errorMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      topicId,
      author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
      timestamp: Date.now(),
      type: 'system',
      content: `Agent ${agent.name} encountered an error: ${content}. Attempting fallback...`,
    };
    this.recordMessageEvent(errorMessage);
    this.emit('message', errorMessage);

    if (!this.simulatedFallback.has(agent.id)) {
      const fallbackAgent = this.agentManager.replaceWithSimulated(agent.id);
      if (fallbackAgent) {
        this.agents = this.agents.map((existing) => (existing.id === agent.id ? fallbackAgent : existing));
        this.simulatedFallback.add(agent.id);
        this.lastAgentMessages.delete(agent.id);
        this.awaitingHumanInput = false;

        const fallbackMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: Date.now(),
          type: 'system',
          content: `Agent ${agent.name} has been switched to a simulated mode for this session.`,
        };
        this.recordMessageEvent(fallbackMessage);
        this.emit('message', fallbackMessage);

        this.scheduler.enqueue({
          type: 'agent_turn',
          agentId: agent.id,
          topicId,
          reason: 'followup',
          timestamp: Date.now(),
        });
        await this.runLoop();
      }
    }
  }

  private normalizeTeamConfig(rawConfig: any): TeamConfig {
    if (!rawConfig || !Array.isArray(rawConfig.members)) {
      throw new Error("Invalid team configuration: 'members' array is missing or invalid.");
    }

    const members: TeamMemberConfig[] = rawConfig.members.map((member: any, index: number) => ({
      id: member.id || `${member.name?.toLowerCase().replace(/\s+/g, '-') || 'agent'}-${index}`,
      name: member.name,
      role: member.role,
      level: member.level,
      model: member.model,
      skills: member.skills || [],
      scope: member.scope || '',
      personality: member.personality || '',
      responsibilities: member.responsibilities || [],
      costPerMinute: member.costPerMinute,
    }));

    return {
      teamName: rawConfig.teamName || 'Tokligence Works Team',
      mode: rawConfig.mode || DEFAULT_MODE,
      sandbox: rawConfig.sandbox || DEFAULT_SANDBOX,
      members,
    };
  }

  private getSandboxLevel(): SandboxLevel {
    return this.teamConfig.sandbox || DEFAULT_SANDBOX;
  }
}
