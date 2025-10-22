/**
 * Example: Jira Integration using TaskManager Hooks
 *
 * This file demonstrates how to integrate Jira (or any external ticketing system)
 * with the TaskManager using lifecycle hooks.
 *
 * To use this in production:
 * 1. Install the Jira client: npm install jira-client
 * 2. Set environment variables: JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
 * 3. Import and register these hooks with your TaskManager instance
 */

import { TaskManager, TaskHooks, Task } from '../orchestrator/TaskManager';

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
  async addNewIssue(issue: any) {
    console.log('[Jira Mock] Creating issue:', issue);
    return {
      key: `PROJ-${Math.floor(Math.random() * 1000)}`,
      id: `${Date.now()}`,
      self: `https://your-domain.atlassian.net/rest/api/2/issue/${Date.now()}`
    };
  }

  async transitionIssue(issueKey: string, transition: any) {
    console.log(`[Jira Mock] Transitioning ${issueKey} to:`, transition);
  }

  async addComment(issueKey: string, comment: string) {
    console.log(`[Jira Mock] Adding comment to ${issueKey}:`, comment);
  }
}

/**
 * Create Jira integration hooks
 */
export function createJiraHooks(jiraClient: JiraClient, projectKey: string): TaskHooks {
  return {
    /**
     * When a task is created, create a corresponding Jira issue
     */
    onCreate: async (task: Task) => {
      try {
        const issue = await jiraClient.addNewIssue({
          fields: {
            project: { key: projectKey },
            summary: task.description,
            description: `Task assigned to: ${task.assignee}\nAssigned by: ${task.assignedBy}`,
            issuetype: { name: 'Task' },
            // You can map assignee to Jira user:
            // assignee: { accountId: mapAgentToJiraUser(task.assignee) }
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
     * When a task starts, transition Jira issue to "In Progress"
     */
    onStart: async (task: Task) => {
      if (!task.externalTicketId) return;

      try {
        await jiraClient.transitionIssue(task.externalTicketId, {
          transition: { name: 'In Progress' }
        });

        console.log(`[Jira Integration] Transitioned ${task.externalTicketId} to In Progress`);
      } catch (error) {
        console.error('[Jira Integration] Failed to transition issue:', error);
      }
    },

    /**
     * When a task completes, transition Jira issue to "Done" and add result comment
     */
    onComplete: async (task: Task) => {
      if (!task.externalTicketId) return;

      try {
        // Add completion comment
        if (task.result) {
          await jiraClient.addComment(
            task.externalTicketId,
            `Task completed by agent.\n\nResult: ${task.result}`
          );
        }

        // Transition to Done
        await jiraClient.transitionIssue(task.externalTicketId, {
          transition: { name: 'Done' }
        });

        console.log(`[Jira Integration] Completed ${task.externalTicketId}`);
      } catch (error) {
        console.error('[Jira Integration] Failed to complete issue:', error);
      }
    },

    /**
     * When a task fails, add error comment to Jira issue
     */
    onFail: async (task: Task) => {
      if (!task.externalTicketId) return;

      try {
        // Add failure comment
        await jiraClient.addComment(
          task.externalTicketId,
          `Task failed.\n\nError: ${task.error || 'Unknown error'}`
        );

        console.log(`[Jira Integration] Logged failure for ${task.externalTicketId}`);
      } catch (error) {
        console.error('[Jira Integration] Failed to log error:', error);
      }
    }
  };
}

/**
 * Example usage in your Orchestrator setup:
 *
 * ```typescript
 * import { createJiraHooks } from './integrations/jira-example';
 * import JiraClient from 'jira-client';
 *
 * // Initialize Jira client
 * const jira = new JiraClient({
 *   protocol: 'https',
 *   host: process.env.JIRA_HOST,
 *   username: process.env.JIRA_EMAIL,
 *   password: process.env.JIRA_API_TOKEN,
 *   apiVersion: '2',
 *   strictSSL: true
 * });
 *
 * // Create hooks
 * const jiraHooks = createJiraHooks(jira, process.env.JIRA_PROJECT_KEY || 'PROJ');
 *
 * // Register hooks with TaskManager
 * const orchestrator = new Orchestrator(...);
 * orchestrator.getTaskManager().registerHooks(jiraHooks);
 * ```
 */

// Export mock client for testing
export const mockJiraClient = new MockJiraClient();
