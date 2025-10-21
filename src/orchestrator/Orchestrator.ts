import { Agent, AgentOutput } from '../agents/Agent';
import { AgentManager } from '../agents/AgentManager';
import { Message, ToolOutputContent } from '../types/Message';
import EventEmitter from 'events';
import { ToolManager } from '../tools/ToolManager'; // Import ToolManager

export class Orchestrator extends EventEmitter {
  private agentManager: AgentManager;
  private teamConfig: any;
  private projectSpec: string;
  private agents: Agent[] = [];
  private messages: Message[] = []; // Global message history for the current session
  private topics: Map<string, Message[]> = new Map(); // Messages grouped by topic
  private toolManager: ToolManager; // Add ToolManager

  constructor(teamConfig: any, projectSpec: string, workspaceDir: string) { // Add workspaceDir
    super();
    this.agentManager = new AgentManager();
    this.teamConfig = teamConfig;
    this.projectSpec = projectSpec;
    this.toolManager = new ToolManager(workspaceDir); // Initialize ToolManager
  }

  async initialize(): Promise<void> {
    console.log("Orchestrator: Initializing agents...");
    this.agents = this.agentManager.createTeam(this.teamConfig);
    console.log(`Orchestrator: ${this.agents.length} agents initialized.`);

    // For MVP, assume the first agent in the config is the Team Lead
    const teamLead = this.agents.find(agent => agent.role.includes("Team Lead"));
    if (!teamLead) {
      throw new Error("No Team Lead agent found in the team configuration.");
    }

    // Initial system message to the team lead
    const initialMessage: Message = {
      id: `msg-${Date.now()}-init`,
      topicId: 'general',
      author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
      timestamp: Date.now(),
      type: 'system',
      content: `Project initialized. Team Lead ${teamLead.name}, please review the project specification and begin task breakdown. Available tools: ${this.toolManager.getToolDescriptions()}`,
    };
    this.addMessage(initialMessage);
    this.emit('message', initialMessage);

    // Team Lead's initial action
    await this.processAgentMessage(teamLead, initialMessage.topicId);
  }

  private addMessage(message: Message): void {
    this.messages.push(message);
    if (!this.topics.has(message.topicId)) {
      this.topics.set(message.topicId, []);
    }
    this.topics.get(message.topicId)?.push(message);
  }

  private getContextForAgent(agent: Agent, topicId: string): { messages: Message[]; team: any; projectSpec: string; } {
    // For MVP, provide all messages in the topic as context
    // In future, this will involve summarization and long-term memory retrieval
    const topicMessages = this.topics.get(topicId) || [];
    return {
      messages: topicMessages,
      team: this.teamConfig,
      projectSpec: this.projectSpec,
    };
  }

  async handleHumanInput(input: string, topicId: string = 'general'): Promise<void> {
    const humanMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      topicId: topicId,
      author: { id: 'human', name: 'You', role: 'User', type: 'human' },
      timestamp: Date.now(),
      type: 'text',
      content: input,
    };
    this.addMessage(humanMessage);
    this.emit('message', humanMessage);

    // For MVP, always route human input to the Team Lead
    const teamLead = this.agents.find(agent => agent.role.includes("Team Lead"));
    if (teamLead) {
      await this.processAgentMessage(teamLead, topicId);
    }
  }

  private async processAgentMessage(agent: Agent, topicId: string): Promise<void> {
    this.emit('agentThinking', { agentId: agent.id, agentName: agent.name, topicId: topicId });
    const context = this.getContextForAgent(agent, topicId);
    const agentOutput: AgentOutput = await agent.execute(context);
    this.addMessage(agentOutput.message);
    this.emit('message', agentOutput.message);

    // Tool call detection and execution
    const toolCallPattern = /^CALL_TOOL: (\w+)\((.*)\)$/;
    const contentString = typeof agentOutput.message.content === 'string' ? agentOutput.message.content : JSON.stringify(agentOutput.message.content);
    const match = contentString.match(toolCallPattern);

    if (match) {
      const toolName = match[1];
      const argsString = match[2];
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(argsString);
      } catch (e) {
        const errorMsg: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          topicId: topicId,
          author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
          timestamp: Date.now(),
          type: 'system',
          content: `Error parsing tool arguments for ${toolName}: ${e instanceof Error ? e.message : String(e)}. Arguments string: ${argsString}`,
        };
        this.addMessage(errorMsg);
        this.emit('message', errorMsg);
        await this.processAgentMessage(agent, topicId); // Let agent react to parsing error
        return;
      }

      this.emit('toolCalling', { agentId: agent.id, agentName: agent.name, toolName, args });
      const toolResult = await this.toolManager.executeTool(toolName, args);

      const toolOutputContent: ToolOutputContent = {
        toolName: toolResult.toolName,
        success: toolResult.success,
        output: toolResult.output,
        error: toolResult.error,
      };

      const toolOutputMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        topicId: topicId,
        author: { id: 'system', name: 'System', role: 'Orchestrator', type: 'agent' },
        timestamp: Date.now(),
        type: 'tool_output',
        content: toolOutputContent,
      };
      this.addMessage(toolOutputMessage);
      this.emit('message', toolOutputMessage);

      // Feed tool output back to the same agent for its next turn
      await this.processAgentMessage(agent, topicId);
      return; // Prevent further processing in this turn
    }

    // Basic routing logic for MVP (if not a tool call):
    if (agentOutput.message.mentions && agentOutput.message.mentions.length > 0) {
      for (const mentionedAgentId of agentOutput.message.mentions) {
        const mentionedAgent = this.agentManager.getAgent(mentionedAgentId);
        if (mentionedAgent) {
          await this.processAgentMessage(mentionedAgent, topicId); // Recursive call for mentioned agent
        }
      }
    } else if (agent.role.includes("Team Lead")) {
      // If Team Lead, and no specific mentions, it's a general update or next step
      // For now, we'll just let the conversation continue, waiting for human input or next step from lead
      console.log(`Team Lead ${agent.name} provided an update. Waiting for next action.`);
    }
  }
}
