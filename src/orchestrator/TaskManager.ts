/**
 * TaskManager - Tracks task assignments and their states
 *
 * Provides explicit task tracking to prevent agents from claiming
 * work done by others and to enable parallel task execution.
 */

export interface Task {
  id: string;
  description: string;
  assignee: string;        // Agent ID assigned to this task
  assignedBy: string;      // Agent ID who assigned the task
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;         // Description of what was accomplished
  error?: string;          // Error message if failed
  dependencies?: string[]; // IDs of tasks that must complete first
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private agentTasks: Map<string, Set<string>> = new Map(); // agentId -> Set<taskId>

  /**
   * Create a new task assignment
   */
  createTask(params: {
    description: string;
    assignee: string;
    assignedBy: string;
    dependencies?: string[];
  }): Task {
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      description: params.description,
      assignee: params.assignee,
      assignedBy: params.assignedBy,
      status: 'pending',
      createdAt: Date.now(),
      dependencies: params.dependencies || [],
    };

    this.tasks.set(task.id, task);

    // Track by agent
    if (!this.agentTasks.has(params.assignee)) {
      this.agentTasks.set(params.assignee, new Set());
    }
    this.agentTasks.get(params.assignee)!.add(task.id);

    return task;
  }

  /**
   * Start working on a task
   */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Check if dependencies are met
    if (task.dependencies && task.dependencies.length > 0) {
      const allDepsComplete = task.dependencies.every(depId => {
        const depTask = this.tasks.get(depId);
        return depTask && depTask.status === 'completed';
      });

      if (!allDepsComplete) {
        return false; // Dependencies not met
      }
    }

    task.status = 'in_progress';
    task.startedAt = Date.now();
    return true;
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, result: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'in_progress') return false;

    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = result;
    return true;
  }

  /**
   * Mark task as failed
   */
  failTask(taskId: string, error: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'failed';
    task.completedAt = Date.now();
    task.error = error;
    return true;
  }

  /**
   * Get all tasks for a specific agent
   */
  getAgentTasks(agentId: string, status?: Task['status']): Task[] {
    const taskIds = this.agentTasks.get(agentId);
    if (!taskIds) return [];

    const tasks = Array.from(taskIds)
      .map(id => this.tasks.get(id))
      .filter((t): t is Task => t !== undefined);

    if (status) {
      return tasks.filter(t => t.status === status);
    }

    return tasks;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all pending tasks that can be started (dependencies met)
   */
  getReadyTasks(): Task[] {
    return Array.from(this.tasks.values()).filter(task => {
      if (task.status !== 'pending') return false;

      // Check dependencies
      if (task.dependencies && task.dependencies.length > 0) {
        return task.dependencies.every(depId => {
          const depTask = this.tasks.get(depId);
          return depTask && depTask.status === 'completed';
        });
      }

      return true;
    });
  }

  /**
   * Get summary of all tasks
   */
  getSummary(): string {
    const pending = Array.from(this.tasks.values()).filter(t => t.status === 'pending').length;
    const inProgress = Array.from(this.tasks.values()).filter(t => t.status === 'in_progress').length;
    const completed = Array.from(this.tasks.values()).filter(t => t.status === 'completed').length;
    const failed = Array.from(this.tasks.values()).filter(t => t.status === 'failed').length;

    return `Tasks: ${pending} pending, ${inProgress} in progress, ${completed} completed, ${failed} failed`;
  }

  /**
   * Get task details for agent context
   */
  getTaskContextForAgent(agentId: string): string {
    const myTasks = this.getAgentTasks(agentId);
    if (myTasks.length === 0) {
      return 'You have no assigned tasks.';
    }

    let context = 'Your assigned tasks:\n';
    myTasks.forEach(task => {
      context += `- [${task.status}] ${task.description}\n`;
      if (task.status === 'in_progress') {
        context += `  (Currently working on this)\n`;
      } else if (task.status === 'completed') {
        context += `  (Completed: ${task.result})\n`;
      } else if (task.status === 'failed') {
        context += `  (Failed: ${task.error})\n`;
      }
    });

    return context;
  }

  /**
   * Extract task assignments from agent messages
   * Parses messages like "@chloe-frontend please create HTML file"
   */
  extractTaskFromMessage(message: string, assignerId: string): { assignee: string; description: string } | null {
    // Look for @mention followed by task description
    const mentionPattern = /@([a-zA-Z0-9_-]+)\s+(.+)/;
    const match = message.match(mentionPattern);

    if (match) {
      return {
        assignee: match[1],
        description: match[2]
      };
    }

    return null;
  }
}
