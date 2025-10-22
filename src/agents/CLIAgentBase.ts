import { Agent, AgentOutput, AgentContext } from './Agent';
import { Message } from '../types/Message';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  PermissionConfig,
  DEFAULT_PERMISSIONS,
  getCLIFlags,
  getCLIEnvironment,
} from './CLIPermissions';

/**
 * Base class for CLI-based agents
 * Wraps external CLI tools (Claude Code, Gemini CLI, etc.) as team members
 */
export abstract class CLIAgentBase implements Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  skills: string[];
  scope: string;
  personality: string;
  level?: string;
  responsibilities?: string[];
  costPerMinute?: number;

  protected process?: ChildProcess;
  protected sessionActive: boolean = false;
  protected permissions: PermissionConfig;
  protected executionCount: number = 0;
  protected lastExecutionTime: number = 0;
  protected maxExecutionsPerMinute: number = 3;
  protected binaryPath?: string;
  protected commandTimeoutMs: number;
  protected logDir: string;

  constructor(config: {
    id: string;
    name: string;
    role: string;
    model: string;
    skills: string[];
    scope: string;
    personality: string;
    level?: string;
    responsibilities?: string[];
    costPerMinute?: number;
    sandboxMode?: 'strict' | 'guided' | 'wild';
    permissions?: PermissionConfig;
    binaryPath?: string;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.model = config.model;
    this.skills = config.skills;
    this.scope = config.scope;
    this.personality = config.personality;
    this.level = config.level;
    this.responsibilities = config.responsibilities;
    this.costPerMinute = config.costPerMinute;
    this.binaryPath = config.binaryPath;

    const timeoutFromEnv = Number(process.env.TOKLIGENCE_CLI_TIMEOUT_MS);
    this.commandTimeoutMs = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
      ? timeoutFromEnv
      : 45_000;

    const logDirEnv = process.env.TOKLIGENCE_CLI_LOG_DIR;
    const resolvedLogDir = logDirEnv
      ? (path.isAbsolute(logDirEnv) ? logDirEnv : path.join(process.cwd(), logDirEnv))
      : path.join(process.cwd(), 'logs');
    this.logDir = resolvedLogDir;

    // Initialize permissions based on sandbox mode or custom config
    const sandboxMode = config.sandboxMode || 'guided';
    this.permissions = config.permissions || DEFAULT_PERMISSIONS[sandboxMode];
  }

  /**
   * Get the CLI command and arguments
   * Must be implemented by subclasses
   */
  protected abstract getCommand(): { command: string; args: string[] };

  /**
   * Build the prompt to send to the CLI tool
   * Must be implemented by subclasses
   */
  protected abstract buildPrompt(context: AgentContext): string;

  /**
   * Parse the CLI tool's response
   * Can be overridden by subclasses for custom parsing
   */
  protected parseResponse(rawResponse: string): string {
    // Remove ANSI color codes
    return rawResponse.replace(/\x1b\[[0-9;]*m/g, '').trim();
  }

  protected getRoleGuidance(): string {
    const roleLower = (this.role || '').toLowerCase();
    const directives: string[] = [];

    if (roleLower.includes('team lead') || roleLower.includes('lead')) {
      directives.push('- Focus on delegating and reviewing work. Only use tools for inspection or when explicitly taking over a blocked task.');
      directives.push('- Do not modify project files yourself; instruct the appropriate developer instead.');
    }

    if (roleLower.includes('qa')) {
      directives.push('- You are responsible for validation only. Never write or modify project files.');
      directives.push('- Use tools to read or inspect outputs, then report your findings to the Team Lead.');
    }

    if ((roleLower.includes('developer') || roleLower.includes('engineer')) && !roleLower.includes('qa')) {
      directives.push('- Personally execute the implementation tasks using the available tools (file_system, terminal).');
      directives.push('- Only report completion after you have performed the required changes yourself.');
    }

    return directives.map((line) => `- ${line}`).join('\n');
  }

  /**
   * Detect if the response is complete
   * Can be overridden by subclasses
   */
  protected isResponseComplete(line: string): boolean {
    // Default: look for common completion markers
    return (
      line.includes('Task completed') ||
      line.includes('Done') ||
      line.includes('Ready') ||
      line.includes('>>') ||
      line.includes('$')
    );
  }

  /**
   * Get the CLI tool name for permission flags
   */
  protected getToolName(): string {
    const { command } = this.getCommand();
    return path.basename(command);
  }

  /**
   * Start CLI session
   */
  protected async startSession(workspaceDir: string): Promise<void> {
    if (this.sessionActive && this.process) {
      return;
    }

    const { command, args } = this.getCommand();
    const toolName = this.getToolName();

    // Generate permission flags and environment
    const permissionFlags = getCLIFlags(toolName, this.permissions);
    const permissionEnv = getCLIEnvironment(this.permissions);

    // Combine custom args with permission flags
    const finalArgs = [...args, ...permissionFlags];

    console.log(`[${this.name}] Starting ${toolName} with auto-approval flags:`, permissionFlags);

    this.process = spawn(command, finalArgs, {
      cwd: workspaceDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: permissionEnv,
    });

    this.sessionActive = true;

    this.process.on('error', (err) => {
      console.error(`[${this.name}] CLI error:`, err);
      this.sessionActive = false;
    });

    this.process.on('exit', (code) => {
      console.log(`[${this.name}] CLI exited with code ${code}`);
      this.sessionActive = false;
    });

    // Wait a bit for process to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Send prompt to CLI and get response
   * Uses stdin to avoid command-line argument length limits
   */
  protected async sendPrompt(prompt: string, workspaceDir: string, timeoutMs?: number): Promise<string> {
    const { command, args } = this.getCommand();
    const toolName = this.getToolName();
    const effectiveTimeout = timeoutMs ?? this.commandTimeoutMs;

    // Generate permission flags and environment
    const permissionFlags = getCLIFlags(toolName, this.permissions);
    const permissionEnv = getCLIEnvironment(this.permissions);

    // Combine custom args with permission flags (no prompt as arg)
    const finalArgs = [...args, ...permissionFlags];

    // Debug logging
    console.log(`[${this.name}] Tool name: "${toolName}"`);
    console.log(`[${this.name}] Original args:`, args);
    console.log(`[${this.name}] Permission flags:`, permissionFlags);
    console.log(`[${this.name}] Final args:`, finalArgs);

    // Log command (show first 100 chars of prompt)
    const shortPrompt = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;
    console.log(`[${this.name}] Executing: ${command} ${finalArgs.join(' ')} < stdin(${prompt.length} chars)`);
    console.log(`[${this.name}] Prompt preview: ${shortPrompt}`);

    return new Promise((resolve, reject) => {
      let response = '';
      let errorOutput = '';
      let timeoutHandle: NodeJS.Timeout;
      let logStream: fs.WriteStream | null = null;
      let logClosed = false;
      const closeLog = (suffix?: string) => {
        if (logClosed) {
          return;
        }
        if (logStream) {
          if (suffix) {
            logStream.write(`${suffix}\n`);
          }
          logStream.end();
        }
        logClosed = true;
      };

      try {
        fs.mkdirSync(this.logDir, { recursive: true });
        const logFilePath = path.join(this.logDir, `${this.id}-${Date.now()}.log`);
        logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        logStream.write(`[${new Date().toISOString()}] ${this.name} executing ${command} ${finalArgs.join(' ')}\n`);
        logStream.write('[PROMPT]\n');
        logStream.write(`${prompt}\n\n`);
      } catch (error) {
        console.warn(`[${this.name}] Failed to initialize CLI log file:`, error);
      }

      // One-shot execution with prompt via stdin
      const childProcess = spawn(command, finalArgs, {
        cwd: workspaceDir,
        stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr
        env: permissionEnv,
      });

      // Write prompt to stdin and close it
      try {
        childProcess.stdin.write(prompt);
        childProcess.stdin.end();
      } catch (err) {
        reject(new Error(`${this.name} failed to write to stdin: ${err}`));
        return;
      }

      // Collect stdout
      childProcess.stdout.on('data', (data) => {
        response += data.toString();
        if (logStream) {
          logStream.write('[STDOUT] ' + data.toString());
        }
      });

      // Collect stderr
      childProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        if (logStream) {
          logStream.write('[STDERR] ' + data.toString());
        }
      });

      // Handle process completion
      childProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);
        closeLog(`[EXIT] code=${code}`);

        if (code === 0) {
          resolve(response.trim());
        } else {
          // Check for common API errors in stdout
          const stdoutLower = response.toLowerCase();
          let errorMessage = '';

          if (stdoutLower.includes('credit balance') || stdoutLower.includes('insufficient credits')) {
            errorMessage = `⚠️ API Credits Exhausted: ${response.trim()}`;
          } else if (stdoutLower.includes('rate limit')) {
            errorMessage = `⚠️ API Rate Limit: ${response.trim()}`;
          } else if (stdoutLower.includes('authentication') || stdoutLower.includes('api key')) {
            errorMessage = `⚠️ API Authentication Error: ${response.trim()}`;
          } else {
            errorMessage = `${this.name} exited with code ${code}.\nError: ${errorOutput || 'No stderr output'}\nOutput: ${response.substring(0, 500)}`;
          }

          reject(new Error(errorMessage));
        }
      });

      // Handle process errors
      childProcess.on('error', (err) => {
        clearTimeout(timeoutHandle);
        closeLog(`[ERROR] ${err.message}`);
        reject(new Error(`${this.name} failed to start: ${err.message}`));
      });

      // Timeout
      timeoutHandle = setTimeout(() => {
        childProcess.kill();
        closeLog(`[TIMEOUT] exceeded ${effectiveTimeout}ms`);
        reject(new Error(`${this.name} timeout after ${effectiveTimeout}ms`));
      }, effectiveTimeout);
    });
  }

  /**
   * Execute the agent
   */
  async execute(context: AgentContext): Promise<AgentOutput> {
    const workspaceDir = path.join(process.cwd(), 'workspace');
    const topicId = context.messages[context.messages.length - 1]?.topicId || 'general';

    // Check for rapid repeated executions
    const now = Date.now();
    const timeSinceLastExecution = now - this.lastExecutionTime;

    if (timeSinceLastExecution < 60000) { // Within the same minute
      this.executionCount++;
      if (this.executionCount > this.maxExecutionsPerMinute) {
        console.log(`[${this.name}] Rate limit reached (${this.executionCount} executions in < 1 minute). Skipping...`);

        const errorMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          author: {
            id: this.id,
            name: this.name,
            role: this.role,
            type: 'agent',
          },
          type: 'text',
          content: 'I am temporarily rate limited and need to pause before taking more actions. Please retry shortly or assign the work elsewhere.',
          timestamp: Date.now(),
          topicId,
        };

        return { message: errorMessage };
      }
    } else {
      // Reset counter for new minute
      this.executionCount = 1;
      this.lastExecutionTime = now;
    }

    // Ensure workspace directory exists
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    try {
      const prompt = this.buildPrompt(context);
      const rawResponse = await this.sendPrompt(prompt, workspaceDir);
      const cleanedResponse = this.parseResponse(rawResponse);

      const message: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        author: {
          id: this.id,
          name: this.name,
          role: this.role,
          type: 'agent',
        },
        type: 'text',
        content: cleanedResponse,
        timestamp: Date.now(),
        topicId,
      };

      return { message };

    } catch (error) {
      console.error(`[${this.name}] Error:`, error);

      const errorMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        author: {
          id: this.id,
          name: this.name,
          role: this.role,
          type: 'agent',
        },
        type: 'text',
        content: `Error: ${error instanceof Error ? error.message : String(error)}. Please assist or provide further instructions.`,
        timestamp: Date.now(),
        topicId,
      };

      return { message: errorMessage };
    }
  }

  /**
   * Shutdown the CLI session
   */
  async shutdown(): Promise<void> {
    if (this.process && this.sessionActive) {
      this.process.kill();
      this.sessionActive = false;
    }
  }
}
