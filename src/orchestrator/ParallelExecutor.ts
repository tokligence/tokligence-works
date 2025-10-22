/**
 * ParallelExecutor - Manages parallel agent execution
 *
 * Allows multiple agents to work simultaneously on independent tasks
 * while preventing conflicts on shared resources.
 */

export interface ResourceLock {
  resourceId: string;  // e.g., file path
  agentId: string;
  acquiredAt: number;
}

export class ParallelExecutor {
  private activeAgents: Set<string> = new Set();  // Currently working agents
  private resourceLocks: Map<string, ResourceLock> = new Map();  // Resource -> Lock
  private maxParallelAgents: number;

  constructor(maxParallelAgents: number = 3) {
    this.maxParallelAgents = maxParallelAgents;
  }

  /**
   * Check if an agent can start working
   */
  canAgentStart(agentId: string): boolean {
    // Agent already working
    if (this.activeAgents.has(agentId)) {
      return false;
    }

    // Too many agents working in parallel
    if (this.activeAgents.size >= this.maxParallelAgents) {
      return false;
    }

    return true;
  }

  /**
   * Mark agent as active
   */
  markAgentActive(agentId: string): boolean {
    if (!this.canAgentStart(agentId)) {
      return false;
    }

    this.activeAgents.add(agentId);
    return true;
  }

  /**
   * Mark agent as idle
   */
  markAgentIdle(agentId: string): void {
    this.activeAgents.delete(agentId);

    // Release all locks held by this agent
    for (const [resourceId, lock] of this.resourceLocks.entries()) {
      if (lock.agentId === agentId) {
        this.resourceLocks.delete(resourceId);
      }
    }
  }

  /**
   * Try to acquire a lock on a resource (e.g., file)
   */
  acquireLock(resourceId: string, agentId: string): boolean {
    const existingLock = this.resourceLocks.get(resourceId);

    // Resource already locked by another agent
    if (existingLock && existingLock.agentId !== agentId) {
      return false;
    }

    // Acquire or renew lock
    this.resourceLocks.set(resourceId, {
      resourceId,
      agentId,
      acquiredAt: Date.now(),
    });

    return true;
  }

  /**
   * Release a lock on a resource
   */
  releaseLock(resourceId: string, agentId: string): boolean {
    const lock = this.resourceLocks.get(resourceId);

    // Can only release own locks
    if (!lock || lock.agentId !== agentId) {
      return false;
    }

    this.resourceLocks.delete(resourceId);
    return true;
  }

  /**
   * Extract resource IDs from tool arguments
   * (e.g., file paths from file_system tool)
   */
  extractResourcesFromTool(toolName: string, args: Record<string, any>): string[] {
    const resources: string[] = [];

    if (toolName === 'file_system' && args.path) {
      resources.push(`file:${args.path}`);
    }

    // Add more tool-specific resource extraction as needed

    return resources;
  }

  /**
   * Check if agent can execute a tool without conflicts
   */
  canExecuteTool(agentId: string, toolName: string, args: Record<string, any>): boolean {
    const resources = this.extractResourcesFromTool(toolName, args);

    // Check all required resources
    for (const resource of resources) {
      const lock = this.resourceLocks.get(resource);
      if (lock && lock.agentId !== agentId) {
        return false; // Resource locked by another agent
      }
    }

    return true;
  }

  /**
   * Acquire locks for tool execution
   */
  acquireToolLocks(agentId: string, toolName: string, args: Record<string, any>): boolean {
    const resources = this.extractResourcesFromTool(toolName, args);

    // Try to acquire all locks
    for (const resource of resources) {
      if (!this.acquireLock(resource, agentId)) {
        // Failed to acquire - rollback
        this.releaseToolLocks(agentId, toolName, args);
        return false;
      }
    }

    return true;
  }

  /**
   * Release locks after tool execution
   */
  releaseToolLocks(agentId: string, toolName: string, args: Record<string, any>): void {
    const resources = this.extractResourcesFromTool(toolName, args);

    for (const resource of resources) {
      this.releaseLock(resource, agentId);
    }
  }

  /**
   * Get status summary
   */
  getStatus(): string {
    return `Active agents: ${this.activeAgents.size}/${this.maxParallelAgents}, Locked resources: ${this.resourceLocks.size}`;
  }

  /**
   * Check if system has capacity for more parallel work
   */
  hasCapacity(): boolean {
    return this.activeAgents.size < this.maxParallelAgents;
  }

  /**
   * Get list of active agents
   */
  getActiveAgents(): string[] {
    return Array.from(this.activeAgents);
  }
}
