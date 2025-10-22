import { CLIAgentBase } from './CLIAgentBase';
import { AgentContext } from './Agent';

/**
 * ClaudeCodeAdapter - Wraps Claude Code CLI as a team member
 *
 * Requires: Claude Code CLI installed globally
 * Installation: npm install -g @anthropic-ai/claude-code
 */
export class ClaudeCodeAdapter extends CLIAgentBase {
  protected getCommand(): { command: string; args: string[] } {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Claude Code requires this.');
    }

    return {
      command: this.binaryPath || 'claude',
      args: [],  // Claude CLI uses env var, not --api-key flag
    };
  }

  protected buildPrompt(context: AgentContext): string {
    const { messages, projectSpec } = context;

    // Extract recent conversation
    const recentMessages = messages.slice(-5).map((msg) => {
      const author = msg.author.name;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return `[${author}]: ${content}`;
    }).join('\n');

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

    const roleGuidance = this.getRoleGuidance();

    return `
# Project Context
${projectSpec}

# Your Role
You are ${this.name}, a ${this.role} on the team.
Skills: ${this.skills.join(', ')}
Scope: ${this.scope}

# Recent Team Communication
${recentMessages}

# Your Task
${task}

# Instructions
- Focus on your assigned coding task
- Use available tools (read/write files, run terminal commands)
- Write clean, well-documented code
- Report completion with a summary of changes made
- If you need clarification, ask the Team Lead

# Role Constraints
${roleGuidance || '- Follow your responsibilities exactly as described.'}

Please execute this task.
`.trim();
  }

  protected isResponseComplete(line: string): boolean {
    // Claude Code CLI completion markers (adjust based on actual CLI behavior)
    return (
      line.includes('Task completed') ||
      line.includes('Ready for next task') ||
      line.includes('claude>') ||
      super.isResponseComplete(line)
    );
  }

  protected parseResponse(rawResponse: string): string {
    let cleaned = super.parseResponse(rawResponse);

    // Remove Claude Code CLI specific formatting
    cleaned = cleaned
      .replace(/^claude>\s*/gm, '')
      .replace(/\[Claude Code\]/g, '')
      .trim();

    return cleaned;
  }
}
