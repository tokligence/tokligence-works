import { ToolResult } from '../tools/Tool';

export type DeliveryMode = 'cost' | 'time' | 'quality';
export type SandboxLevel = 'strict' | 'guided' | 'wild';

export type AgentLevel = 'junior' | 'mid' | 'senior' | 'principal';

export interface TeamMemberConfig {
  id: string;
  name: string;
  role: string;
  level?: AgentLevel;
  model: string;
  skills?: string[];
  scope?: string;
  personality?: string;
  responsibilities?: string[];
  costPerMinute?: number;
}

export interface TeamConfig {
  teamName: string;
  mode?: DeliveryMode;
  sandbox?: SandboxLevel;
  members: TeamMemberConfig[];
}

export type ConversationEvent =
  | {
      kind: 'message';
      authorId: string;
      topicId: string;
      body: string;
      mentions?: string[];
      level?: AgentLevel;
      role: string;
      name: string;
      timestamp: number;
    }
  | {
      kind: 'tool_call';
      agentId: string;
      topicId: string;
      tool: string;
      args: Record<string, unknown>;
      timestamp: number;
    }
  | {
      kind: 'tool_result';
      topicId: string;
      result: ToolResult;
      timestamp: number;
    }
  | {
      kind: 'handoff';
      topicId: string;
      from: string;
      to: string;
      reason: string;
      timestamp: number;
    }
  | {
      kind: 'status';
      topicId: string;
      status: TopicStatus;
      timestamp: number;
    }
  | {
      kind: 'human_input';
      topicId: string;
      body: string;
      timestamp: number;
      authorId: string;
      name: string;
      role: string;
    };

export type TopicStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'blocked';

export interface TopicState {
  id: string;
  title: string;
  summary: string;
  events: ConversationEvent[];
  status: TopicStatus;
  activeAssignee?: string;
}

export interface ScheduledTaskBase {
  topicId: string;
  timestamp: number;
}

export type ScheduledTask =
  | (ScheduledTaskBase & {
      type: 'agent_turn';
      agentId: string;
      reason: 'init' | 'mention' | 'followup' | 'review' | 'human';
      metadata?: Record<string, unknown>;
    })
  | (ScheduledTaskBase & {
      type: 'tool_result';
      result: ToolResult;
      agentId: string;
    });

export interface SessionOptions {
  mode: DeliveryMode;
  sandbox: SandboxLevel;
}

export interface SessionState {
  id: string;
  team: TeamConfig;
  spec: string;
  topics: Map<string, TopicState>;
  options: SessionOptions;
}
