/**
 * ProjectResolver - Resolves which Jira project to use for tasks
 *
 * Implements multi-level fallback logic to determine the correct Jira project
 * for each task, supporting real-world scenarios where agents work across
 * multiple projects simultaneously.
 */

import { Task, TaskHookContext } from '../orchestrator/TaskManager';

export interface ProjectContext {
  /**
   * Project specification metadata
   * Can be parsed from SPEC.md or project configuration
   */
  projectSpec?: {
    jiraProject?: string;        // Default Jira project for this work
    jiraProjects?: string[];     // Multiple projects this work spans
  };

  /**
   * Global fallback project
   */
  globalDefaultProject?: string;
}

/**
 * Resolves Jira project key using multi-level fallback
 */
export class ProjectResolver {
  private projectContext: ProjectContext;

  constructor(projectContext: ProjectContext = {}) {
    this.projectContext = projectContext;
  }

  /**
   * Update project context (useful when project spec changes)
   */
  updateContext(projectContext: Partial<ProjectContext>): void {
    this.projectContext = { ...this.projectContext, ...projectContext };
  }

  /**
   * Resolve Jira project key with fallback logic
   *
   * Priority (highest to lowest):
   * 1. Task.jiraProject - Explicit project specified for this task
   * 2. Task.metadata.jiraProject - Project in task metadata
   * 3. ProjectSpec.jiraProject - Default project in project specification
   * 4. Agent.jira.defaultProjects[0] - Agent's first default project
   * 5. Global default project - Configured fallback
   *
   * @param context - Task hook context with task and credentials
   * @returns Resolved project key or undefined
   */
  resolveProject(context: TaskHookContext): string | undefined {
    const { task, assigneeCredentials } = context;

    // Level 1: Explicit task-level project (highest priority)
    if (task.jiraProject) {
      console.log(`[ProjectResolver] Using task-level project: ${task.jiraProject}`);
      return task.jiraProject;
    }

    // Level 2: Task metadata project
    if (task.metadata?.jiraProject) {
      console.log(`[ProjectResolver] Using task metadata project: ${task.metadata.jiraProject}`);
      return task.metadata.jiraProject as string;
    }

    // Level 3: Project spec default
    if (this.projectContext.projectSpec?.jiraProject) {
      console.log(`[ProjectResolver] Using project spec default: ${this.projectContext.projectSpec.jiraProject}`);
      return this.projectContext.projectSpec.jiraProject;
    }

    // Level 4: Agent's first default project
    const agentDefaultProjects = assigneeCredentials?.jira?.defaultProjects;
    if (agentDefaultProjects && agentDefaultProjects.length > 0) {
      console.log(`[ProjectResolver] Using agent default project: ${agentDefaultProjects[0]}`);
      return agentDefaultProjects[0];
    }

    // Level 5: Global fallback
    if (this.projectContext.globalDefaultProject) {
      console.log(`[ProjectResolver] Using global default: ${this.projectContext.globalDefaultProject}`);
      return this.projectContext.globalDefaultProject;
    }

    console.warn(`[ProjectResolver] No project found for task ${task.id}, will use integration default`);
    return undefined;
  }

  /**
   * Get all possible projects for a task context
   * Useful for validation or showing available options
   */
  getAllPossibleProjects(context: TaskHookContext): string[] {
    const projects = new Set<string>();

    // Add all sources
    if (context.task.jiraProject) projects.add(context.task.jiraProject);
    if (context.task.metadata?.jiraProject) projects.add(context.task.metadata.jiraProject as string);
    if (this.projectContext.projectSpec?.jiraProject) projects.add(this.projectContext.projectSpec.jiraProject);
    if (this.projectContext.projectSpec?.jiraProjects) {
      this.projectContext.projectSpec.jiraProjects.forEach(p => projects.add(p));
    }
    if (context.assigneeCredentials?.jira?.defaultProjects) {
      context.assigneeCredentials.jira.defaultProjects.forEach(p => projects.add(p));
    }
    if (this.projectContext.globalDefaultProject) projects.add(this.projectContext.globalDefaultProject);

    return Array.from(projects);
  }

  /**
   * Validate if a project key is accessible for the given context
   * Can be extended to check actual Jira API access
   */
  isProjectAccessible(projectKey: string, context: TaskHookContext): boolean {
    const possibleProjects = this.getAllPossibleProjects(context);
    return possibleProjects.includes(projectKey);
  }
}

/**
 * Parse project information from SPEC.md content
 *
 * Looks for patterns like:
 * - Jira Project: FRONTEND
 * - Jira Projects: FRONTEND, MOBILE, BACKEND
 * - ## Jira Project\nFRONTEND
 */
export function parseProjectFromSpec(specContent: string): ProjectContext['projectSpec'] {
  const result: ProjectContext['projectSpec'] = {};

  // Pattern 1: "Jira Project: PROJ"
  const singleProjectMatch = specContent.match(/Jira Project:\s*([A-Z][A-Z0-9_-]*)/i);
  if (singleProjectMatch) {
    result.jiraProject = singleProjectMatch[1];
  }

  // Pattern 2: "Jira Projects: PROJ1, PROJ2"
  const multiProjectMatch = specContent.match(/Jira Projects:\s*([A-Z][A-Z0-9_,-\s]*)/i);
  if (multiProjectMatch) {
    result.jiraProjects = multiProjectMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // If multiple projects, use first as default
    if (!result.jiraProject && result.jiraProjects.length > 0) {
      result.jiraProject = result.jiraProjects[0];
    }
  }

  return result;
}
