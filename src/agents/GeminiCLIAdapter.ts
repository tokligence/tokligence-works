import { CLIAgentBase } from './CLIAgentBase';
import { AgentContext } from './Agent';

/**
 * GeminiCLIAdapter - Wraps Google Gemini CLI as a team member
 *
 * Requires: Google Cloud CLI with Gemini support
 * Installation: gcloud components install gemini
 */
export class GeminiCLIAdapter extends CLIAgentBase {
  protected getCommand(): { command: string; args: string[] } {
    return {
      command: this.binaryPath || 'gemini',
      args: [],  // Gemini CLI uses env var
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
Personality: ${this.personality}

# Recent Team Communication
${recentMessages}

# Your Task
${task}

# Instructions
- Execute the assigned task using available tools
- Write code, modify files, or run commands as needed
- Report back with a summary of what you accomplished
- If blocked, ask the Team Lead for guidance

# Role Constraints
${roleGuidance || '- Follow your responsibilities exactly as described.'}

Please complete this task.
`.trim();
  }

  protected isResponseComplete(line: string): boolean {
    // Gemini CLI completion markers (adjust based on actual CLI behavior)
    return (
      line.includes('Response complete') ||
      line.includes('gemini>') ||
      line.includes('Task finished') ||
      super.isResponseComplete(line)
    );
  }

  protected parseResponse(rawResponse: string): string {
    let cleaned = super.parseResponse(rawResponse);

    // Remove Gemini CLI specific formatting
    cleaned = cleaned
      .replace(/^gemini>\s*/gm, '')
      .replace(/\[Gemini\]/g, '')
      .trim();

    return cleaned;
  }
}
