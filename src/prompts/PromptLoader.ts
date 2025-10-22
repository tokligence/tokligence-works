/**
 * PromptLoader - Loads role-specific prompts from markdown files
 *
 * This utility centralizes prompt management, making it easy to:
 * - Update prompts without modifying code
 * - Maintain consistent prompts across different LLM adapters
 * - Version control prompts separately from code
 */

import fs from 'fs';
import path from 'path';

export class PromptLoader {
  private static promptCache: Map<string, string> = new Map();
  private static promptsDir: string;

  /**
   * Initialize the prompt loader with the prompts directory path
   * @param projectRoot - The root directory of the project
   */
  static initialize(projectRoot: string): void {
    this.promptsDir = path.join(projectRoot, 'prompts');
  }

  /**
   * Load a prompt file
   * @param fileName - Name of the prompt file (without .md extension)
   * @returns The content of the prompt file
   */
  static load(fileName: string): string {
    // Check cache first
    if (this.promptCache.has(fileName)) {
      return this.promptCache.get(fileName)!;
    }

    // Load from file
    const filePath = path.join(this.promptsDir || path.join(__dirname, '../../prompts'), `${fileName}.md`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.promptCache.set(fileName, content);
      return content;
    } catch (error) {
      console.error(`[PromptLoader] Failed to load prompt file ${fileName}.md:`, error);
      // Return empty string as fallback
      return '';
    }
  }

  /**
   * Get role-specific instructions based on agent role
   * @param role - The agent's role (e.g., "Team Lead", "Frontend Developer")
   * @returns The appropriate role instructions
   */
  static getRoleInstructions(role: string): string {
    const roleLower = role.toLowerCase();

    if (roleLower.includes('team lead') || roleLower.includes('lead')) {
      return this.load('team-lead');
    } else {
      return this.load('team-member');
    }
  }

  /**
   * Get general rules that apply to all agents
   * @returns The general rules content
   */
  static getGeneralRules(): string {
    return this.load('general');
  }

  /**
   * Build complete system prompt for an agent
   * @param params - Agent configuration parameters
   * @returns Complete system prompt
   */
  static buildSystemPrompt(params: {
    name: string;
    role: string;
    level?: string;
    skills: string[];
    scope: string;
    personality: string;
    responsibilities?: string[];
    projectSpec: string;
    teamMembers: any[];
    metadata?: string;
  }): string {
    const { name, role, level, skills, scope, personality, responsibilities, projectSpec, teamMembers, metadata } = params;

    const responsibilitiesText = responsibilities?.length
      ? `Responsibilities: ${responsibilities.join(', ')}.`
      : '';

    const roleInstructions = this.getRoleInstructions(role);
    const generalRules = this.getGeneralRules();
    const roleConstraints = this.getRoleConstraints(role);

    return `You are ${name}, a ${role}${level ? ` (${level})` : ''}.
Your skills include: ${skills.join(', ')}.
Your scope of work is: ${scope}.
Your personality is: ${personality}.
${responsibilitiesText}

Project Specification:
${projectSpec}

Team Members:
${JSON.stringify(teamMembers, null, 2)}

Your goal is to collaborate with the team to achieve the project objectives. Respond concisely and professionally.

## Role-Specific Instructions

${roleInstructions}

## General Rules

${generalRules}
${roleConstraints ? `
## Role-Specific Constraints

${roleConstraints}
` : ''}
${metadata || ''}`;
  }

  private static getRoleConstraints(role: string): string {
    const lines: string[] = [];
    const roleLower = role.toLowerCase();

    if (roleLower.includes('team lead') || roleLower.includes('lead')) {
      lines.push('- Focus on planning, delegation, and reviews. Do not implement features unless you explicitly take over a blocked task.');
      lines.push('- Avoid writing or modifying project files directly; instruct the assigned developer to make changes.');
    }

    if (roleLower.includes('qa')) {
      lines.push('- You are responsible for verification and feedback only. Never modify project files or run destructive commands.');
      lines.push('- Use tools such as `file_system.read` or safe terminal commands to inspect results, then report findings to the Team Lead.');
    }

    if ((roleLower.includes('developer') || roleLower.includes('engineer')) && !roleLower.includes('qa')) {
      lines.push('- You must carry out the implementation personally. Use the available tools to modify files, run tests, and deliver artifacts.');
      lines.push('- Do not claim completion unless you executed the required commands yourself.');
    }

    return lines.join('\n');
  }

  /**
   * Clear the prompt cache (useful for hot-reloading in development)
   */
  static clearCache(): void {
    this.promptCache.clear();
  }

  /**
   * Reload a specific prompt file (useful for development)
   * @param fileName - Name of the prompt file to reload
   */
  static reload(fileName: string): string {
    this.promptCache.delete(fileName);
    return this.load(fileName);
  }
}
