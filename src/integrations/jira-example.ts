/**
 * Example: Multi-Account Jira Integration using TaskManager Hooks
 *
 * This file demonstrates how to integrate Jira with MULTI-ACCOUNT support,
 * where each agent has their own Jira account, email, and API token.
 *
 * Setup:
 * 1. Install jira-client: npm install jira-client
 * 2. Configure agent credentials (see examples below)
 * 3. Register hooks with TaskManager
 *
 * Each agent authenticates with their own credentials and creates tickets
 * assigned to themselves in Jira.
 */

import { TaskManager, TaskHooks, TaskHookContext } from '../orchestrator/TaskManager';
import { AgentCredentialsManager } from '../config/AgentCredentials';
import { ProjectResolver } from './ProjectResolver';

/**
 * Example Jira client interface
 * In production, use the actual jira-client package
 */
interface JiraClient {
  addNewIssue(issue: any): Promise<{ key: string; id: string; self: string }>;
  transitionIssue(issueKey: string, transition: any): Promise<void>;
  addComment(issueKey: string, comment: string): Promise<void>;
}

/**
 * Mock Jira client for demonstration
 * Replace with actual JiraClient from jira-client package
 */
class MockJiraClient implements JiraClient {
  constructor(private email?: string, private apiToken?: string) {}

  async addNewIssue(issue: any) {
    console.log(`[Jira Mock ${this.email}] Creating issue:`, issue.fields.summary);
    console.log(`  - Assignee: ${issue.fields.assignee?.accountId || 'Unassigned'}`);
    return {
      key: `PROJ-${Math.floor(Math.random() * 1000)}`,
      id: `${Date.now()}`,
      self: `https://your-domain.atlassian.net/rest/api/2/issue/${Date.now()}`
    };
  }

  async transitionIssue(issueKey: string, transition: any) {
    console.log(`[Jira Mock ${this.email}] Transitioning ${issueKey} to:`, transition.transition?.name);
  }

  async addComment(issueKey: string, comment: string) {
    console.log(`[Jira Mock ${this.email}] Adding comment to ${issueKey}:`, comment.substring(0, 50));
  }
}

/**
 * Factory for creating Jira clients with agent-specific credentials
 */
class JiraClientFactory {
  constructor(
    private defaultHost: string,
    private defaultProjectKey: string,
    private projectResolver: ProjectResolver
  ) {}

  /**
   * Create a Jira client using agent's credentials
   * Falls back to default/shared credentials if agent doesn't have their own
   */
  createClient(context: TaskHookContext): JiraClient {
    const { assigneeCredentials } = context;

    // Use agent's Jira credentials if available
    const jiraCreds = assigneeCredentials?.jira;
    const email = jiraCreds?.email || assigneeCredentials?.email?.address;
    const apiToken = jiraCreds?.apiToken || process.env.JIRA_API_TOKEN;
    const host = jiraCreds?.host || this.defaultHost;

    // In production, use actual JiraClient:
    // return new JiraClient({
    //   protocol: 'https',
    //   host: host,
    //   username: email,
    //   password: apiToken,
    //   apiVersion: '2',
    //   strictSSL: true
    // });

    // For demo, use mock client
    return new MockJiraClient(email, apiToken);
  }

  /**
   * Get Jira account ID for assignee from credentials
   */
  getAssigneeAccountId(context: TaskHookContext): string | undefined {
    return context.assigneeCredentials?.jira?.accountId;
  }

  /**
   * Resolve which Jira project to use for this task
   * Uses multi-level fallback logic via ProjectResolver
   */
  resolveProject(context: TaskHookContext): string {
    const resolved = this.projectResolver.resolveProject(context);
    return resolved || this.defaultProjectKey;
  }
}

/**
 * Create multi-account Jira hooks
 * Each agent uses their own Jira credentials for authentication
 *
 * @param jiraHost - Default Jira host (e.g., 'company.atlassian.net')
 * @param defaultProjectKey - Fallback project key if no other project is resolved
 * @param projectResolver - Optional ProjectResolver for multi-project support
 */
export function createMultiAccountJiraHooks(
  jiraHost: string,
  defaultProjectKey: string,
  projectResolver?: ProjectResolver
): TaskHooks {
  const resolver = projectResolver || new ProjectResolver({ globalDefaultProject: defaultProjectKey });
  const factory = new JiraClientFactory(jiraHost, defaultProjectKey, resolver);

  return {
    /**
     * Create Jira issue with assignee's credentials
     */
    onCreate: async (context: TaskHookContext) => {
      const { task, assigneeCredentials, assignerCredentials } = context;

      console.log('[Jira Hook:onCreate] ========== START ==========');
      console.log(`[Jira Hook:onCreate:DEBUG] Task ID: ${task.id}`);
      console.log(`[Jira Hook:onCreate:DEBUG] Description: ${task.description}`);
      console.log(`[Jira Hook:onCreate:DEBUG] Assignee: ${task.assignee}`);
      console.log(`[Jira Hook:onCreate:DEBUG] Assigned By: ${task.assignedBy}`);
      console.log(`[Jira Hook:onCreate:DEBUG] Task jiraProject: ${task.jiraProject || 'not specified'}`);
      console.log(`[Jira Hook:onCreate:DEBUG] Assignee has credentials: ${!!assigneeCredentials}`);
      if (assigneeCredentials) {
        console.log(`[Jira Hook:onCreate:DEBUG] Assignee Jira email: ${assigneeCredentials.jira?.email || 'not set'}`);
        console.log(`[Jira Hook:onCreate:DEBUG] Assignee Jira account ID: ${assigneeCredentials.jira?.accountId || 'not set'}`);
        console.log(`[Jira Hook:onCreate:DEBUG] Assignee default projects: ${assigneeCredentials.jira?.defaultProjects?.join(', ') || 'none'}`);
      }

      try {
        // Use assignee's Jira client
        const jiraClient = factory.createClient(context);
        const assigneeAccountId = factory.getAssigneeAccountId(context);

        // Resolve which project to use (multi-level fallback)
        const resolvedProject = factory.resolveProject(context);

        console.log(`[Jira Hook:onCreate:DEBUG] Resolved project: ${resolvedProject}`);
        console.log(`[Jira Hook:onCreate] Creating issue in project ${resolvedProject} for ${task.assignee} using their credentials`);

        const issue = await jiraClient.addNewIssue({
          fields: {
            project: { key: resolvedProject },
            summary: task.description,
            description: `Task assigned to: ${task.assignee}\nAssigned by: ${task.assignedBy}`,
            issuetype: { name: 'Task' },
            // Assign to the agent's Jira account
            ...(assigneeAccountId && {
              assignee: { accountId: assigneeAccountId }
            })
          }
        });

        console.log(`[Jira Hook:onCreate] ✓ Created issue ${issue.key} for task ${task.id}`);
        console.log(`[Jira Hook:onCreate:DEBUG] Issue URL: ${issue.self}`);
        console.log('[Jira Hook:onCreate] ========== END (SUCCESS) ==========');

        return {
          externalTicketId: issue.key,
          externalTicketUrl: issue.self
        };
      } catch (error) {
        console.error('[Jira Hook:onCreate] ========== END (FAILED) ==========');
        console.error('[Jira Hook:onCreate:ERROR] Failed to create issue:', error);
        console.error(`[Jira Hook:onCreate:ERROR] Task ID: ${task.id}`);
        // Don't throw - allow task creation to succeed even if Jira fails
      }
    },

    /**
     * Update issue status using assignee's credentials
     */
    onStart: async (context: TaskHookContext) => {
      const { task, assigneeCredentials } = context;

      console.log('[Jira Hook:onStart] ========== START ==========');
      console.log(`[Jira Hook:onStart:DEBUG] Task ID: ${task.id}`);
      console.log(`[Jira Hook:onStart:DEBUG] External Ticket ID: ${task.externalTicketId || 'not set'}`);
      console.log(`[Jira Hook:onStart:DEBUG] Assignee: ${task.assignee}`);

      if (!task.externalTicketId) {
        console.warn('[Jira Hook:onStart:WARN] No external ticket ID, skipping transition');
        console.log('[Jira Hook:onStart] ========== END (SKIPPED) ==========');
        return;
      }

      try {
        const jiraClient = factory.createClient(context);

        console.log(`[Jira Hook:onStart] ${task.assignee} starting work on ${task.externalTicketId}`);
        console.log(`[Jira Hook:onStart:DEBUG] Transitioning to: In Progress`);

        await jiraClient.transitionIssue(task.externalTicketId, {
          transition: { name: 'In Progress' }
        });

        console.log(`[Jira Hook:onStart] ✓ Transitioned ${task.externalTicketId} to In Progress`);
        console.log('[Jira Hook:onStart] ========== END (SUCCESS) ==========');
      } catch (error) {
        console.error('[Jira Hook:onStart] ========== END (FAILED) ==========');
        console.error('[Jira Hook:onStart:ERROR] Failed to transition issue:', error);
        console.error(`[Jira Hook:onStart:ERROR] Ticket ID: ${task.externalTicketId}`);
      }
    },

    /**
     * Complete issue using assignee's credentials
     */
    onComplete: async (context: TaskHookContext) => {
      const { task, assigneeCredentials } = context;

      console.log('[Jira Hook:onComplete] ========== START ==========');
      console.log(`[Jira Hook:onComplete:DEBUG] Task ID: ${task.id}`);
      console.log(`[Jira Hook:onComplete:DEBUG] External Ticket ID: ${task.externalTicketId || 'not set'}`);
      console.log(`[Jira Hook:onComplete:DEBUG] Assignee: ${task.assignee}`);
      console.log(`[Jira Hook:onComplete:DEBUG] Result: ${task.result || 'no result provided'}`);

      if (!task.externalTicketId) {
        console.warn('[Jira Hook:onComplete:WARN] No external ticket ID, skipping completion');
        console.log('[Jira Hook:onComplete] ========== END (SKIPPED) ==========');
        return;
      }

      try {
        const jiraClient = factory.createClient(context);

        console.log(`[Jira Hook:onComplete] ${task.assignee} completing ${task.externalTicketId}`);

        // Add completion comment
        if (task.result) {
          console.log(`[Jira Hook:onComplete:DEBUG] Adding completion comment`);
          await jiraClient.addComment(
            task.externalTicketId,
            `Task completed by ${task.assignee}.\n\nResult: ${task.result}`
          );
        }

        // Transition to Done
        console.log(`[Jira Hook:onComplete:DEBUG] Transitioning to: Done`);
        await jiraClient.transitionIssue(task.externalTicketId, {
          transition: { name: 'Done' }
        });

        console.log(`[Jira Hook:onComplete] ✓ Completed ${task.externalTicketId}`);
        console.log('[Jira Hook:onComplete] ========== END (SUCCESS) ==========');
      } catch (error) {
        console.error('[Jira Hook:onComplete] ========== END (FAILED) ==========');
        console.error('[Jira Hook:onComplete:ERROR] Failed to complete issue:', error);
        console.error(`[Jira Hook:onComplete:ERROR] Ticket ID: ${task.externalTicketId}`);
      }
    },

    /**
     * Log failure using assignee's credentials
     */
    onFail: async (context: TaskHookContext) => {
      const { task, assigneeCredentials } = context;

      console.log('[Jira Hook:onFail] ========== START ==========');
      console.log(`[Jira Hook:onFail:DEBUG] Task ID: ${task.id}`);
      console.log(`[Jira Hook:onFail:DEBUG] External Ticket ID: ${task.externalTicketId || 'not set'}`);
      console.log(`[Jira Hook:onFail:DEBUG] Assignee: ${task.assignee}`);
      console.log(`[Jira Hook:onFail:DEBUG] Error: ${task.error || 'no error message'}`);

      if (!task.externalTicketId) {
        console.warn('[Jira Hook:onFail:WARN] No external ticket ID, skipping failure logging');
        console.log('[Jira Hook:onFail] ========== END (SKIPPED) ==========');
        return;
      }

      try {
        const jiraClient = factory.createClient(context);

        console.log(`[Jira Hook:onFail] Logging failure for ${task.externalTicketId}`);
        console.log(`[Jira Hook:onFail:DEBUG] Adding failure comment`);

        await jiraClient.addComment(
          task.externalTicketId,
          `Task failed.\n\nError: ${task.error || 'Unknown error'}\nAgent: ${task.assignee}`
        );

        console.log(`[Jira Hook:onFail] ✓ Logged failure for ${task.externalTicketId}`);
        console.log('[Jira Hook:onFail] ========== END (SUCCESS) ==========');
      } catch (error) {
        console.error('[Jira Hook:onFail] ========== END (FAILED) ==========');
        console.error('[Jira Hook:onFail:ERROR] Failed to log error:', error);
        console.error(`[Jira Hook:onFail:ERROR] Ticket ID: ${task.externalTicketId}`);
      }
    }
  };
}

/**
 * Complete example usage with multi-account and multi-project setup:
 *
 * ## Option 1: Load from environment variables
 *
 * ```bash
 * # Set up agent credentials in environment
 * export AGENT_CHLOE_FRONTEND_EMAIL=chloe@company.com
 * export AGENT_CHLOE_FRONTEND_JIRA_EMAIL=chloe@company.com
 * export AGENT_CHLOE_FRONTEND_JIRA_ACCOUNT_ID=557058:abc123
 * export AGENT_CHLOE_FRONTEND_JIRA_API_TOKEN=chloe_token_here
 *
 * export AGENT_BOB_BACKEND_EMAIL=bob@company.com
 * export AGENT_BOB_BACKEND_JIRA_EMAIL=bob@company.com
 * export AGENT_BOB_BACKEND_JIRA_ACCOUNT_ID=557058:def456
 * export AGENT_BOB_BACKEND_JIRA_API_TOKEN=bob_token_here
 *
 * export AGENT_ALEX_LEAD_EMAIL=alex@company.com
 * export AGENT_ALEX_LEAD_JIRA_EMAIL=alex@company.com
 * export AGENT_ALEX_LEAD_JIRA_ACCOUNT_ID=557058:ghi789
 * export AGENT_ALEX_LEAD_JIRA_API_TOKEN=alex_token_here
 * ```
 *
 * ```typescript
 * import { AgentCredentialsManager } from './config/AgentCredentials';
 * import { createMultiAccountJiraHooks } from './integrations/jira-example';
 *
 * // Create credentials manager
 * const credentialsManager = new AgentCredentialsManager();
 *
 * // Load from environment variables
 * credentialsManager.loadFromEnvironment([
 *   'chloe-frontend',
 *   'bob-backend',
 *   'alex-lead'
 * ]);
 *
 * // Create orchestrator and set credentials
 * const orchestrator = new Orchestrator(teamConfig, projectSpec, workspaceDir);
 * await orchestrator.initialize();
 *
 * orchestrator.getTaskManager().setCredentialsManager(credentialsManager);
 *
 * // Register multi-account Jira hooks
 * const jiraHooks = createMultiAccountJiraHooks(
 *   process.env.JIRA_HOST || 'your-domain.atlassian.net',
 *   process.env.JIRA_PROJECT_KEY || 'PROJ'
 * );
 * orchestrator.getTaskManager().registerHooks(jiraHooks);
 * ```
 *
 * ## Option 2: Load from configuration object
 *
 * ```typescript
 * const credentialsManager = new AgentCredentialsManager();
 *
 * credentialsManager.loadFromConfig({
 *   'chloe-frontend': {
 *     email: { address: 'chloe@company.com' },
 *     jira: {
 *       email: 'chloe@company.com',
 *       accountId: '557058:abc123',
 *       apiToken: process.env.CHLOE_JIRA_TOKEN
 *     }
 *   },
 *   'bob-backend': {
 *     email: { address: 'bob@company.com' },
 *     jira: {
 *       email: 'bob@company.com',
 *       accountId: '557058:def456',
 *       apiToken: process.env.BOB_JIRA_TOKEN
 *     }
 *   },
 *   'alex-lead': {
 *     email: { address: 'alex@company.com' },
 *     jira: {
 *       email: 'alex@company.com',
 *       accountId: '557058:ghi789',
 *       apiToken: process.env.ALEX_JIRA_TOKEN
 *     }
 *   }
 * });
 *
 * // Then register hooks as shown above
 * ```
 *
 * ## Option 3: Multi-Project Support
 *
 * Real-world scenario: Agents work across multiple Jira projects
 *
 * ```typescript
 * import { ProjectResolver, parseProjectFromSpec } from './integrations/ProjectResolver';
 * import * as fs from 'fs';
 *
 * // 1. Set up agent credentials with default projects
 * const credentialsManager = new AgentCredentialsManager();
 * credentialsManager.loadFromConfig({
 *   'chloe-frontend': {
 *     email: { address: 'chloe@company.com' },
 *     jira: {
 *       accountId: '557058:abc123',
 *       apiToken: process.env.CHLOE_JIRA_TOKEN,
 *       defaultProjects: ['FRONTEND', 'MOBILE']  // Chloe works on 2 projects
 *     }
 *   },
 *   'bob-backend': {
 *     email: { address: 'bob@company.com' },
 *     jira: {
 *       accountId: '557058:def456',
 *       apiToken: process.env.BOB_JIRA_TOKEN,
 *       defaultProjects: ['BACKEND', 'API']  // Bob works on different projects
 *     }
 *   }
 * });
 *
 * // 2. Parse project from SPEC.md
 * const specContent = fs.readFileSync('./SPEC.md', 'utf-8');
 * const projectSpec = parseProjectFromSpec(specContent);
 *
 * // 3. Create ProjectResolver with multi-level fallback
 * const projectResolver = new ProjectResolver({
 *   projectSpec,
 *   globalDefaultProject: 'GENERAL'  // Fallback if nothing else matches
 * });
 *
 * // 4. Set up Jira hooks with ProjectResolver
 * const orchestrator = new Orchestrator(teamConfig, projectSpec, workspaceDir);
 * await orchestrator.initialize();
 * orchestrator.getTaskManager().setCredentialsManager(credentialsManager);
 *
 * const jiraHooks = createMultiAccountJiraHooks(
 *   'company.atlassian.net',
 *   'GENERAL',
 *   projectResolver  // Pass ProjectResolver for multi-project support
 * );
 * orchestrator.getTaskManager().registerHooks(jiraHooks);
 *
 * // 5. Now tasks can specify projects at different levels:
 *
 * // Task-level (highest priority):
 * const taskWithProject = await taskManager.createTask({
 *   description: 'Fix login bug',
 *   assignee: 'chloe-frontend',
 *   assignedBy: 'alex-lead',
 *   jiraProject: 'MOBILE'  // Explicitly use MOBILE project
 * });
 * // → Creates ticket in MOBILE project
 *
 * // Agent-level (uses agent's default):
 * const taskUsingAgentDefault = await taskManager.createTask({
 *   description: 'Add feature',
 *   assignee: 'bob-backend',
 *   assignedBy: 'alex-lead'
 *   // No jiraProject specified
 * });
 * // → Uses Bob's first default project: BACKEND
 *
 * // Project spec level (from SPEC.md):
 * // If SPEC.md contains: "Jira Project: FRONTEND"
 * const taskUsingSpec = await taskManager.createTask({
 *   description: 'Update UI',
 *   assignee: 'chloe-frontend',
 *   assignedBy: 'alex-lead'
 * });
 * // → Uses project from SPEC.md: FRONTEND
 * ```
 *
 * ## SPEC.md Format for Jira Projects
 *
 * Add to your SPEC.md:
 *
 * ```markdown
 * # Project Specification
 *
 * ## Jira Integration
 * Jira Project: FRONTEND
 *
 * <!-- Or for multiple projects: -->
 * Jira Projects: FRONTEND, MOBILE, DESIGN
 * ```
 *
 * ## How it works:
 *
 * 1. Each agent has their own Jira email, account ID, and API token
 * 2. When a task is created, it uses the assignee's credentials
 * 3. The Jira ticket is created with the assignee's account
 * 4. All updates (start, complete, fail) use the assignee's credentials
 * 5. This ensures proper authentication and audit trails in Jira
 */

// Export mock client for testing
export const mockJiraClient = new MockJiraClient();
