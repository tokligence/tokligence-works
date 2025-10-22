/**
 * TaskManager - Tracks task assignments and their states
 *
 * Provides explicit task tracking to prevent agents from claiming
 * work done by others and to enable parallel task execution.
 *
 * Supports lifecycle hooks for external integrations (e.g., Jira, Asana).
 */

import { AgentCredentials, AgentCredentialsManager } from '../config/AgentCredentials';

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
  externalTicketId?: string; // External ticket ID (e.g., Jira ticket key like "PROJ-123")
  externalTicketUrl?: string; // URL to external ticket
  jiraProject?: string;    // Specific Jira project key for this task (overrides defaults)
  metadata?: Record<string, any>; // Extensible metadata for integrations
}

/**
 * Context provided to task lifecycle hooks
 * Contains task information and agent credentials
 */
export interface TaskHookContext {
  task: Task;
  assigneeCredentials?: AgentCredentials;  // Credentials of the agent assigned to the task
  assignerCredentials?: AgentCredentials;  // Credentials of the agent who created the task
}

/**
 * Lifecycle hooks for external integrations
 * These hooks are called at key points in task lifecycle
 * Hooks receive both task info and agent credentials for multi-account support
 */
export interface TaskHooks {
  /**
   * Called when a new task is created
   * Useful for creating tickets in external systems (Jira, Asana, etc.)
   * Can use assigneeCredentials to set correct ticket assignee
   */
  onCreate?: (context: TaskHookContext) => Promise<{ externalTicketId?: string; externalTicketUrl?: string } | void>;

  /**
   * Called when a task starts
   * Useful for updating ticket status in external systems
   * Can use assigneeCredentials to authenticate with correct account
   */
  onStart?: (context: TaskHookContext) => Promise<void>;

  /**
   * Called when a task completes successfully
   * Useful for updating ticket status and adding completion notes
   * Can use assigneeCredentials to update ticket with correct permissions
   */
  onComplete?: (context: TaskHookContext) => Promise<void>;

  /**
   * Called when a task fails
   * Useful for updating ticket status and logging errors
   * Can use assigneeCredentials to update ticket with correct permissions
   */
  onFail?: (context: TaskHookContext) => Promise<void>;
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private agentTasks: Map<string, Set<string>> = new Map(); // agentId -> Set<taskId>
  private hooks: TaskHooks = {};
  private credentialsManager?: AgentCredentialsManager;

  /**
   * Set the credentials manager for agent authentication
   * @param manager - AgentCredentialsManager instance
   */
  setCredentialsManager(manager: AgentCredentialsManager): void {
    this.credentialsManager = manager;
  }

  /**
   * Get the credentials manager
   * @returns The credentials manager or undefined
   */
  getCredentialsManager(): AgentCredentialsManager | undefined {
    return this.credentialsManager;
  }

  /**
   * Build hook context with task and credentials
   * @param task - The task object
   * @returns TaskHookContext with task and credentials
   */
  private buildHookContext(task: Task): TaskHookContext {
    return {
      task,
      assigneeCredentials: this.credentialsManager?.get(task.assignee),
      assignerCredentials: this.credentialsManager?.get(task.assignedBy),
    };
  }

  /**
   * Register lifecycle hooks for external integrations
   * @param hooks - Object containing lifecycle hook callbacks
   *
   * @example
   * ```typescript
   * taskManager.registerHooks({
   *   onCreate: async (context) => {
   *     const { task, assigneeCredentials } = context;
   *     // Use assigneeCredentials to authenticate and set correct assignee
   *     const ticket = await jiraClient.createIssue({
   *       summary: task.description,
   *       assignee: assigneeCredentials?.jira?.accountId
   *     });
   *     return { externalTicketId: ticket.key, externalTicketUrl: ticket.url };
   *   },
   *   onComplete: async (context) => {
   *     // Use context.assigneeCredentials for authentication
   *     await jiraClient.transitionIssue(context.task.externalTicketId, 'Done');
   *   }
   * });
   * ```
   */
  registerHooks(hooks: TaskHooks): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  /**
   * Create a new task assignment
   */
  async createTask(params: {
    description: string;
    assignee: string;
    assignedBy: string;
    dependencies?: string[];
  }): Promise<Task> {
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

    // Call onCreate hook if registered
    if (this.hooks.onCreate) {
      try {
        const context = this.buildHookContext(task);
        const externalData = await this.hooks.onCreate(context);
        if (externalData) {
          task.externalTicketId = externalData.externalTicketId;
          task.externalTicketUrl = externalData.externalTicketUrl;
        }
      } catch (error) {
        console.error(`[TaskManager] onCreate hook failed for task ${task.id}:`, error);
      }
    }

    return task;
  }

  /**
   * Start working on a task
   */
  async startTask(taskId: string): Promise<boolean> {
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

    // Call onStart hook if registered
    if (this.hooks.onStart) {
      try {
        const context = this.buildHookContext(task);
        await this.hooks.onStart(context);
      } catch (error) {
        console.error(`[TaskManager] onStart hook failed for task ${task.id}:`, error);
      }
    }

    return true;
  }

  getActiveTasksForAgent(agentId: string): Task[] {
    const taskIds = this.agentTasks.get(agentId);
    if (!taskIds) {
      return [];
    }
    const active: Task[] = [];
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task && task.status !== 'completed' && task.status !== 'failed') {
        active.push(task);
      }
    }
    return active;
  }

  hasActiveTask(agentId: string): boolean {
    return this.getActiveTasksForAgent(agentId).length > 0;
  }

  async completeTasksForAgent(agentId: string, result?: string): Promise<void> {
    const taskIds = this.agentTasks.get(agentId);
    if (!taskIds || taskIds.size === 0) {
      return;
    }

    const now = Date.now();
    for (const taskId of [...taskIds]) {
      const task = this.tasks.get(taskId);
      if (!task || task.status === 'completed') {
        taskIds.delete(taskId);
        continue;
      }

      if (!task.startedAt) {
        task.startedAt = now;
      }
      task.status = 'completed';
      task.completedAt = now;
      if (result) {
        task.result = result;
      }

      if (this.hooks.onComplete) {
        try {
          await this.hooks.onComplete(this.buildHookContext(task));
        } catch (error) {
          console.error(`[TaskManager] onComplete hook failed for task ${task.id}:`, error);
        }
      }

      taskIds.delete(taskId);
    }
  }

  /**
   * Mark task as completed
   */
  async completeTask(taskId: string, result: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'in_progress') return false;

    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = result;

    // Call onComplete hook if registered
    if (this.hooks.onComplete) {
      try {
        const context = this.buildHookContext(task);
        await this.hooks.onComplete(context);
      } catch (error) {
        console.error(`[TaskManager] onComplete hook failed for task ${task.id}:`, error);
      }
    }

    return true;
  }

  /**
   * Mark task as failed
   */
  async failTask(taskId: string, error: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'failed';
    task.completedAt = Date.now();
    task.error = error;

    // Call onFail hook if registered
    if (this.hooks.onFail) {
      try {
        const context = this.buildHookContext(task);
        await this.hooks.onFail(context);
      } catch (error) {
        console.error(`[TaskManager] onFail hook failed for task ${task.id}:`, error);
      }
    }

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
