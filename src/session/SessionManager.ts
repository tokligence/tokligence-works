import { ConversationEvent, SessionOptions, SessionState, TeamConfig, TopicState, TopicStatus } from '../types/Session';

export class SessionManager {
  private state: SessionState;

  constructor(id: string, team: TeamConfig, spec: string, options: SessionOptions) {
    this.state = {
      id,
      team,
      spec,
      topics: new Map(),
      options,
    };
    this.createTopic('general', 'General Discussion');
  }

  getSessionState(): SessionState {
    return this.state;
  }

  createTopic(topicId: string, title: string): TopicState {
    const topic: TopicState = {
      id: topicId,
      title,
      summary: '',
      events: [],
      status: 'pending',
    };
    this.state.topics.set(topicId, topic);
    return topic;
  }

  getTopic(topicId: string): TopicState {
    const existing = this.state.topics.get(topicId);
    if (!existing) {
      return this.createTopic(topicId, topicId);
    }
    return existing;
  }

  appendEvent(event: ConversationEvent): void {
    const topic = this.getTopic(event.topicId || 'general');
    topic.events.push(event);
    if (event.kind === 'message') {
      if (topic.status === 'pending') {
        topic.status = 'in_progress';
      }
      if (event.level === 'junior') {
        topic.status = 'review';
      }
    } else if (event.kind === 'status') {
      topic.status = event.status;
    }
  }

  updateTopicStatus(topicId: string, status: TopicStatus): void {
    const topic = this.getTopic(topicId);
    topic.status = status;
    topic.events.push({
      kind: 'status',
      topicId,
      status,
      timestamp: Date.now(),
    });
  }

  getRecentEvents(topicId: string, limit = 15): ConversationEvent[] {
    const topic = this.getTopic(topicId);
    return topic.events.slice(-limit);
  }
}
