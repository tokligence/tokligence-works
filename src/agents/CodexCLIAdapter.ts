import { CLIAgentBase } from './CLIAgentBase';
import { AgentContext } from './Agent';

/**
 * CodexCLIAdapter - Wraps OpenAI Codex CLI as a team member
 *
 * Requires: OpenAI Codex CLI installed
 * Installation: npm install -g openai-codex-cli (or similar)
 */
export class CodexCLIAdapter extends CLIAgentBase {
  protected getCommand(): { command: string; args: string[] } {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Codex CLI requires this.');
    }

    return {
      command: this.binaryPath || 'codex',
      args: [
        'exec',
        '--skip-git-repo-check',
        '--sandbox', 'workspace-write'  // Enable workspace write permissions
      ],
    };
  }

  protected buildPrompt(context: AgentContext): string {
    const { messages, projectSpec } = context;

    // Clean and limit conversation history to prevent recursive buildup
    const cleanMessages = messages.slice(-5).map((msg) => {
      const author = msg.author.name;
      let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      // Remove Codex CLI output artifacts from previous messages
      if (content.includes('[2025-') || content.includes('OpenAI Codex')) {
        // This is likely a message containing Codex output - clean it
        const firstCodexIndex = content.indexOf('[2025-');
        if (firstCodexIndex > 0) {
          content = content.substring(0, firstCodexIndex).trim();
        }

        // Also remove any lines that look like Codex metadata
        const lines = content.split('\n');
        const cleanLines = lines.filter(line => {
          const trimmed = line.trim();
          return !trimmed.startsWith('[2025-') &&
                 !trimmed.startsWith('OpenAI Codex') &&
                 !trimmed.startsWith('tokens used:') &&
                 !trimmed.startsWith('workdir:') &&
                 !trimmed.startsWith('model:') &&
                 !trimmed.startsWith('--------');
        });
        content = cleanLines.join('\n').trim();
      }

      // Limit message length to prevent prompt explosion
      if (content.length > 500) {
        content = content.substring(0, 500) + '... [truncated]';
      }

      return `[${author}]: ${content}`;
    }).filter(msg => msg.length > 10); // Filter out empty messages

    // Find task assigned to this agent
    const lastMention = [...messages]
      .reverse()
      .find((msg) =>
        typeof msg.content === 'string' &&
        msg.content.includes(`@${this.id}`)
      );

    const task = lastMention
      ? typeof lastMention.content === 'string' ? lastMention.content : ''
      : 'Continue working on the project';

    // Clean the task string as well
    const taskLines = task.split('\n');
    const cleanTask = taskLines.filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('[2025-') &&
             !trimmed.startsWith('OpenAI Codex') &&
             !trimmed.startsWith('tokens used:');
    }).join('\n').trim();

    const roleGuidance = this.getRoleGuidance();

    return `
# Project Context
${projectSpec}

# Your Role
You are ${this.name}, a ${this.role} on the team.
Skills: ${this.skills.join(', ')}
Personality: ${this.personality}

# Recent Team Communication (Summary)
${cleanMessages.join('\n')}

# Your Task
${cleanTask}

# Instructions
- Execute the assigned coding task
- Write clean, efficient code
- Follow best practices for the language/framework
- Report completion with a summary of changes
- If you need clarification, ask the Team Lead

# Role Constraints
${roleGuidance || '- Follow your responsibilities exactly as described.'}

Please complete this task.
`.trim();
  }

  protected isResponseComplete(line: string): boolean {
    // Codex CLI / Aider completion markers
    return (
      line.includes('Commit') ||
      line.includes('Done') ||
      line.includes('aider>') ||
      line.includes('Applied') ||
      line.includes('No changes') ||
      super.isResponseComplete(line)
    );
  }

  protected parseResponse(rawResponse: string): string {
    let cleaned = super.parseResponse(rawResponse);

    // Extract only the final Codex response, ignoring all metadata
    // Look for the last line starting with "codex" followed by actual response
    const lines = cleaned.split('\n');
    const codexResponses: string[] = [];
    let captureNext = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip metadata lines
      if (line.startsWith('[2025-') || // Timestamps
          line.startsWith('OpenAI Codex') || // Headers
          line.startsWith('--------') ||
          line.startsWith('workdir:') ||
          line.startsWith('model:') ||
          line.startsWith('provider:') ||
          line.startsWith('approval:') ||
          line.startsWith('sandbox:') ||
          line.startsWith('reasoning') ||
          line.startsWith('tokens used:') ||
          line.includes('exec bash') ||
          line.includes('succeeded in')) {
        continue;
      }

      // Capture lines after "codex" marker
      if (line.startsWith('codex')) {
        captureNext = true;
        continue;
      }

      // Capture the actual response
      if (captureNext && line.length > 0) {
        codexResponses.push(line);
        captureNext = false;
      }
    }

    // Return the last meaningful response from Codex
    if (codexResponses.length > 0) {
      return codexResponses[codexResponses.length - 1];
    }

    const fallbackLine = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .pop();

    if (fallbackLine) {
      return fallbackLine;
    }

    return 'Task processing...';
  }
}
