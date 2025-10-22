import { Scheduler } from './Scheduler';
import { TeamConfig } from '../types/Session';

const teamConfig: TeamConfig = {
  teamName: 'Test Team',
  mode: 'quality',
  sandbox: 'guided',
  members: [
    { id: 'lead', name: 'Lead', role: 'Team Lead', level: 'principal', model: 'openai/gpt-4' },
    { id: 'senior-dev', name: 'Senior', role: 'Senior Dev', level: 'senior', model: 'openai/gpt-4o-mini' },
    { id: 'junior-dev', name: 'Junior', role: 'Junior Dev', level: 'junior', model: 'google/gemini-pro' },
  ],
};

describe('Scheduler', () => {
  it('queues team lead on initial turn', () => {
    const scheduler = new Scheduler(teamConfig);
    scheduler.scheduleInitialTurn('general');
    const task = scheduler.dequeue();
    expect(task?.type).toBe('agent_turn');
    expect(task?.agentId).toBe('lead');
  });

  it('schedules mentions in order', () => {
    const scheduler = new Scheduler(teamConfig);
    scheduler.scheduleMentions('general', ['junior-dev', 'senior-dev']);
    const first = scheduler.dequeue();
    const second = scheduler.dequeue();
    expect(first?.agentId).toBe('junior-dev');
    expect(second?.agentId).toBe('senior-dev');
  });

  it('routes junior output to senior reviewer', () => {
    const scheduler = new Scheduler(teamConfig);
    scheduler.scheduleReviewIfNeeded('general', 'junior-dev');
    const task = scheduler.dequeue();
    expect(task?.type).toBe('agent_turn');
    if (task?.type === 'agent_turn') {
      expect(task.reason).toBe('review');
      expect(task.agentId).toBe('senior-dev');
    }
  });

  it('falls back to team lead when no reviewer available', () => {
    const config: TeamConfig = {
      teamName: 'Tiny Team',
      mode: 'time',
      sandbox: 'guided',
      members: [
        { id: 'lead', name: 'Lead', role: 'Team Lead', level: 'principal', model: 'openai/gpt-4' },
        { id: 'solo', name: 'Solo', role: 'Solo', level: 'principal', model: 'openai/gpt-4o' },
      ],
    };
    const scheduler = new Scheduler(config);
    scheduler.scheduleReviewIfNeeded('general', 'solo');
    const task = scheduler.dequeue();
    expect(task?.type).toBe('agent_turn');
    if (task?.type === 'agent_turn') {
      expect(task.agentId).toBe('lead');
    }
  });
});
