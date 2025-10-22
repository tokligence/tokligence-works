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
    private projectKey: string
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
}

/**
 * Create multi-account Jira hooks
 * Each agent uses their own Jira credentials for authentication
 */
export function createMultiAccountJiraHooks(
  jiraHost: string,
  projectKey: string
): TaskHooks {
  const factory = new JiraClientFactory(jiraHost, projectKey);

  return {
    /**
     * Create Jira issue with assignee's credentials
     */
    onCreate: async (context: TaskHookContext) => {
      const { task } = context;

      try {
        // Use assignee's Jira client
        const jiraClient = factory.createClient(context);
        const assigneeAccountId = factory.getAssigneeAccountId(context);

        console.log(`[Jira Integration] Creating issue for ${task.assignee} using their credentials`);

        const issue = await jiraClient.addNewIssue({
          fields: {
            project: { key: projectKey },
            summary: task.description,
            description: `Task assigned to: ${task.assignee}\nAssigned by: ${task.assignedBy}`,
            issuetype: { name: 'Task' },
            // Assign to the agent's Jira account
            ...(assigneeAccountId && {
              assignee: { accountId: assigneeAccountId }
            })
          }
        });

        console.log(`[Jira Integration] Created issue ${issue.key} for task ${task.id}`);

        return {
          externalTicketId: issue.key,
          externalTicketUrl: issue.self
        };
      } catch (error) {
        console.error('[Jira Integration] Failed to create issue:', error);
        // Don't throw - allow task creation to succeed even if Jira fails
      }
    },

    /**
     * Update issue status using assignee's credentials
     */
    onStart: async (context: TaskHookContext) => {
      const { task } = context;
      if (!task.externalTicketId) return;

      try {
        const jiraClient = factory.createClient(context);

        console.log(`[Jira Integration] ${task.assignee} starting work on ${task.externalTicketId}`);

        await jiraClient.transitionIssue(task.externalTicketId, {
          transition: { name: 'In Progress' }
        });
      } catch (error) {
        console.error('[Jira Integration] Failed to transition issue:', error);
      }
    },

    /**
     * Complete issue using assignee's credentials
     */
    onComplete: async (context: TaskHookContext) => {
      const { task } = context;
      if (!task.externalTicketId) return;

      try {
        const jiraClient = factory.createClient(context);

        console.log(`[Jira Integration] ${task.assignee} completing ${task.externalTicketId}`);

        // Add completion comment
        if (task.result) {
          await jiraClient.addComment(
            task.externalTicketId,
            `Task completed by ${task.assignee}.\n\nResult: ${task.result}`
          );
        }

        // Transition to Done
        await jiraClient.transitionIssue(task.externalTicketId, {
          transition: { name: 'Done' }
        });
      } catch (error) {
        console.error('[Jira Integration] Failed to complete issue:', error);
      }
    },

    /**
     * Log failure using assignee's credentials
     */
    onFail: async (context: TaskHookContext) => {
      const { task } = context;
      if (!task.externalTicketId) return;

      try {
        const jiraClient = factory.createClient(context);

        console.log(`[Jira Integration] Logging failure for ${task.externalTicketId}`);

        await jiraClient.addComment(
          task.externalTicketId,
          `Task failed.\n\nError: ${task.error || 'Unknown error'}\nAgent: ${task.assignee}`
        );
      } catch (error) {
        console.error('[Jira Integration] Failed to log error:', error);
      }
    }
  };
}

/**
 * Complete example usage with multi-account setup:
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
