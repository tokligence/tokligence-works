/**
 * AgentCredentials - Manages credentials for each agent
 *
 * This allows each agent to have their own:
 * - Email address
 * - Jira account
 * - Slack user ID
 * - Other external service credentials
 *
 * This is essential for multi-agent systems where each agent
 * represents a real team member with their own accounts.
 */

export interface JiraCredentials {
  accountId?: string;      // Jira account ID for assignee mapping
  email?: string;          // Email associated with Jira account
  apiToken?: string;       // Personal API token for this agent
  host?: string;           // Jira host (if different from global config)
}

export interface SlackCredentials {
  userId?: string;         // Slack user ID
  token?: string;          // Bot token or user token
}

export interface EmailCredentials {
  address: string;         // Email address
  displayName?: string;    // Display name
}

/**
 * Credentials for a single agent
 */
export interface AgentCredentials {
  agentId: string;
  email?: EmailCredentials;
  jira?: JiraCredentials;
  slack?: SlackCredentials;
  // Extensible for other services
  custom?: Record<string, any>;
}

/**
 * Manages credentials for all agents in the team
 */
export class AgentCredentialsManager {
  private credentials: Map<string, AgentCredentials> = new Map();

  /**
   * Register credentials for an agent
   * @param creds - Agent credentials configuration
   */
  register(creds: AgentCredentials): void {
    this.credentials.set(creds.agentId, creds);
  }

  /**
   * Register multiple agents' credentials at once
   * @param credsList - Array of agent credentials
   */
  registerBatch(credsList: AgentCredentials[]): void {
    credsList.forEach(creds => this.register(creds));
  }

  /**
   * Get credentials for a specific agent
   * @param agentId - The agent ID
   * @returns Agent credentials or undefined if not found
   */
  get(agentId: string): AgentCredentials | undefined {
    return this.credentials.get(agentId);
  }

  /**
   * Check if an agent has registered credentials
   * @param agentId - The agent ID
   * @returns True if credentials exist
   */
  has(agentId: string): boolean {
    return this.credentials.has(agentId);
  }

  /**
   * Get all registered agent IDs
   * @returns Array of agent IDs with credentials
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.credentials.keys());
  }

  /**
   * Load credentials from environment variables
   * Expects format: AGENT_{AGENT_ID}_JIRA_EMAIL, AGENT_{AGENT_ID}_JIRA_TOKEN, etc.
   *
   * @example
   * ```bash
   * export AGENT_CHLOE_FRONTEND_EMAIL=chloe@company.com
   * export AGENT_CHLOE_FRONTEND_JIRA_EMAIL=chloe@company.com
   * export AGENT_CHLOE_FRONTEND_JIRA_ACCOUNT_ID=557058:abc123
   * export AGENT_CHLOE_FRONTEND_JIRA_API_TOKEN=your_token_here
   * ```
   */
  loadFromEnvironment(agentIds: string[]): void {
    agentIds.forEach(agentId => {
      const envPrefix = `AGENT_${agentId.toUpperCase().replace(/-/g, '_')}`;

      const creds: AgentCredentials = { agentId };

      // Email
      const email = process.env[`${envPrefix}_EMAIL`];
      if (email) {
        creds.email = {
          address: email,
          displayName: process.env[`${envPrefix}_EMAIL_NAME`]
        };
      }

      // Jira
      const jiraEmail = process.env[`${envPrefix}_JIRA_EMAIL`];
      const jiraAccountId = process.env[`${envPrefix}_JIRA_ACCOUNT_ID`];
      const jiraToken = process.env[`${envPrefix}_JIRA_API_TOKEN`];
      const jiraHost = process.env[`${envPrefix}_JIRA_HOST`];

      if (jiraEmail || jiraAccountId || jiraToken || jiraHost) {
        creds.jira = {
          email: jiraEmail,
          accountId: jiraAccountId,
          apiToken: jiraToken,
          host: jiraHost
        };
      }

      // Slack
      const slackUserId = process.env[`${envPrefix}_SLACK_USER_ID`];
      const slackToken = process.env[`${envPrefix}_SLACK_TOKEN`];

      if (slackUserId || slackToken) {
        creds.slack = {
          userId: slackUserId,
          token: slackToken
        };
      }

      // Only register if there are any credentials
      if (creds.email || creds.jira || creds.slack) {
        this.register(creds);
        console.log(`[AgentCredentials] Loaded credentials for ${agentId}`);
      }
    });
  }

  /**
   * Load credentials from configuration object
   * Useful for loading from team.yml or similar config files
   *
   * @param config - Configuration object mapping agent IDs to credentials
   *
   * @example
   * ```typescript
   * manager.loadFromConfig({
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
   *   }
   * });
   * ```
   */
  loadFromConfig(config: Record<string, Omit<AgentCredentials, 'agentId'>>): void {
    Object.entries(config).forEach(([agentId, creds]) => {
      this.register({ agentId, ...creds });
      console.log(`[AgentCredentials] Loaded credentials for ${agentId}`);
    });
  }

  /**
   * Clear all registered credentials (useful for testing)
   */
  clear(): void {
    this.credentials.clear();
  }
}
