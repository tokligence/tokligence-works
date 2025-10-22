import { AgentLevel, ScheduledTask, TeamConfig, TeamMemberConfig } from '../types/Session';

const levelRank: Record<AgentLevel, number> = {
  junior: 1,
  mid: 2,
  senior: 3,
  principal: 4,
};

export class Scheduler {
  private queue: ScheduledTask[] = [];
  private teamIndex: Map<string, TeamMemberConfig> = new Map();
  private teamLeadId?: string;

  constructor(teamConfig: TeamConfig) {
    teamConfig.members.forEach((member) => {
      this.teamIndex.set(member.id, member);
      if (!this.teamLeadId && /team lead/i.test(member.role)) {
        this.teamLeadId = member.id;
      }
    });
    if (!this.teamLeadId && teamConfig.members.length > 0) {
      this.teamLeadId = teamConfig.members[0].id;
    }
  }

  enqueue(task: ScheduledTask): void {
    this.queue.push(task);
    this.queue.sort((a, b) => a.timestamp - b.timestamp);
  }

  dequeue(): ScheduledTask | undefined {
    return this.queue.shift();
  }

  hasPendingTasks(): boolean {
    return this.queue.length > 0;
  }

  scheduleInitialTurn(topicId: string): void {
    if (!this.teamLeadId) {
      return;
    }
    this.enqueue({
      type: 'agent_turn',
      agentId: this.teamLeadId,
      topicId,
      reason: 'init',
      timestamp: Date.now(),
    });
  }

  scheduleMentions(topicId: string, mentions: string[]): void {
    mentions.forEach((mentionedId, index) => {
      if (this.teamIndex.has(mentionedId)) {
        this.enqueue({
          type: 'agent_turn',
          agentId: mentionedId,
          topicId,
          reason: 'mention',
          timestamp: Date.now() + index,
        });
      }
    });
  }

  scheduleReviewIfNeeded(topicId: string, authorId: string): void {
    const author = this.teamIndex.get(authorId);
    if (!author || !author.level) {
      return;
    }
    const authorLevel = author.level;
    const reviewer = this.findReviewer(authorLevel, authorId);
    if (reviewer) {
      this.enqueue({
        type: 'agent_turn',
        agentId: reviewer.id,
        topicId,
        reason: 'review',
        metadata: { authorId },
        timestamp: Date.now(),
      });
    } else if (this.teamLeadId && this.teamLeadId !== authorId) {
      this.enqueue({
        type: 'agent_turn',
        agentId: this.teamLeadId,
        topicId,
        reason: 'review',
        metadata: { authorId },
        timestamp: Date.now(),
      });
    }
  }

  routeBackToLead(topicId: string, currentAgentId: string): void {
    if (!this.teamLeadId || this.teamLeadId === currentAgentId) {
      return;
    }
    this.enqueue({
      type: 'agent_turn',
      agentId: this.teamLeadId,
      topicId,
      reason: 'followup',
      metadata: { from: currentAgentId },
      timestamp: Date.now(),
    });
  }

  private findReviewer(authorLevel: AgentLevel, excludeId: string): TeamMemberConfig | undefined {
    const neededRank = levelRank[authorLevel];
    let candidate: TeamMemberConfig | undefined;
    this.teamIndex.forEach((member) => {
      if (!member.level || member.id === excludeId) {
        return;
      }
      if (levelRank[member.level] > neededRank) {
        if (!candidate || levelRank[member.level] < levelRank[candidate.level!]) {
          candidate = member;
        }
      }
    });
    return candidate;
  }
}
