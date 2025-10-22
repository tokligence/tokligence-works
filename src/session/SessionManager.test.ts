import { SessionManager } from './SessionManager';
import { TeamConfig } from '../types/Session';

const teamConfig: TeamConfig = {
  teamName: 'Test',
  mode: 'time',
  sandbox: 'guided',
  members: [
    { id: 'lead', name: 'Lead', role: 'Team Lead', model: 'openai/gpt-4', level: 'principal' },
  ],
};

describe('SessionManager', () => {
  it('initializes with a general topic', () => {
    const manager = new SessionManager('session-1', teamConfig, 'Spec', { mode: 'time', sandbox: 'guided' });
    const topic = manager.getTopic('general');
    expect(topic.id).toBe('general');
    expect(topic.status).toBe('pending');
  });

  it('marks topic in progress after message and review when junior speaks', () => {
    const manager = new SessionManager('session-1', teamConfig, 'Spec', { mode: 'time', sandbox: 'guided' });
    manager.appendEvent({
      kind: 'message',
      authorId: 'lead',
      topicId: 'general',
      body: 'Hello',
      role: 'Team Lead',
      name: 'Lead',
      level: 'principal',
      timestamp: Date.now(),
    });
    expect(manager.getTopic('general').status).toBe('in_progress');

    manager.appendEvent({
      kind: 'message',
      authorId: 'junior',
      topicId: 'general',
      body: 'Update from junior',
      role: 'Dev',
      name: 'Junior',
      level: 'junior',
      timestamp: Date.now(),
    });
    expect(manager.getTopic('general').status).toBe('review');
  });

  it('limits recent events', () => {
    const manager = new SessionManager('session-1', teamConfig, 'Spec', { mode: 'time', sandbox: 'guided' });
    for (let i = 0; i < 20; i++) {
      manager.appendEvent({
        kind: 'message',
        authorId: 'lead',
        topicId: 'general',
        body: `Message ${i}`,
        role: 'Team Lead',
        name: 'Lead',
        level: 'principal',
        timestamp: Date.now() + i,
      });
    }
    const events = manager.getRecentEvents('general', 5);
    expect(events).toHaveLength(5);
    const first = events[0];
    if (first.kind === 'message') {
      expect(first.body).toContain('Message 15');
    } else {
      fail('Expected a message event');
    }
  });
});
