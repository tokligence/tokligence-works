/**
 * Permission management for CLI-based agents
 * Controls file access, command execution, and other sensitive operations
 */

export interface PermissionConfig {
  // Sandbox mode determines default permission levels
  sandboxMode: 'strict' | 'guided' | 'wild';

  // File system permissions
  fileSystem: {
    allowedPaths: string[];      // Whitelist of paths (glob patterns)
    blockedPaths: string[];      // Blacklist of paths (glob patterns)
    allowRead: boolean;
    allowWrite: boolean;
    allowDelete: boolean;
  };

  // Command execution permissions
  terminal: {
    allowedCommands: string[];   // Whitelist of commands (e.g., ['npm', 'git'])
    blockedCommands: string[];   // Blacklist of commands (e.g., ['rm -rf', 'sudo'])
    allowAll: boolean;
  };

  // Network permissions
  network: {
    allowOutbound: boolean;
    allowedDomains: string[];
    blockedDomains: string[];
  };

  // Auto-approval settings
  autoApprove: {
    fileRead: boolean;
    fileWrite: boolean;
    commandExecution: boolean;
    networkAccess: boolean;
  };
}

/**
 * Default permission configurations based on sandbox mode
 */
export const DEFAULT_PERMISSIONS: Record<string, PermissionConfig> = {
  strict: {
    sandboxMode: 'strict',
    fileSystem: {
      allowedPaths: ['workspace/**'],
      blockedPaths: [
        '~/.ssh/**',
        '~/.aws/**',
        '~/.config/**',
        '/etc/**',
        '/System/**',
        '*.env',
        '.env.*',
        'credentials.*',
      ],
      allowRead: true,
      allowWrite: true,
      allowDelete: false,
    },
    terminal: {
      allowedCommands: ['npm', 'git', 'node', 'python', 'pip', 'yarn', 'pnpm'],
      blockedCommands: ['rm -rf', 'sudo', 'su', 'chmod', 'chown', 'curl', 'wget'],
      allowAll: false,
    },
    network: {
      allowOutbound: false,
      allowedDomains: [],
      blockedDomains: ['*'],
    },
    autoApprove: {
      fileRead: true,
      fileWrite: false,   // Still require approval for writes
      commandExecution: false,
      networkAccess: false,
    },
  },

  guided: {
    sandboxMode: 'guided',
    fileSystem: {
      allowedPaths: ['workspace/**', 'src/**', 'tests/**', 'docs/**'],
      blockedPaths: [
        '~/.ssh/**',
        '~/.aws/**',
        '/etc/**',
        '/System/**',
        '*.env',
        '.env.*',
        'credentials.*',
        'id_rsa*',
      ],
      allowRead: true,
      allowWrite: true,
      allowDelete: false,
    },
    terminal: {
      allowedCommands: [
        'npm', 'yarn', 'pnpm', 'node', 'python', 'pip',
        'git', 'docker', 'make', 'cargo', 'go',
        'ls', 'cat', 'grep', 'find', 'echo',
      ],
      blockedCommands: ['rm -rf /', 'sudo', 'su', 'dd', 'mkfs'],
      allowAll: false,
    },
    network: {
      allowOutbound: true,
      allowedDomains: ['*'],
      blockedDomains: [],
    },
    autoApprove: {
      fileRead: true,
      fileWrite: true,    // Auto-approve within allowed paths
      commandExecution: true,  // Auto-approve allowed commands
      networkAccess: true,
    },
  },

  wild: {
    sandboxMode: 'wild',
    fileSystem: {
      allowedPaths: ['**'],
      blockedPaths: [
        '/System/**',  // Still protect system files on macOS
        '/Windows/**', // Still protect system files on Windows
      ],
      allowRead: true,
      allowWrite: true,
      allowDelete: true,
    },
    terminal: {
      allowedCommands: ['*'],
      blockedCommands: ['rm -rf /', 'dd if=/dev/zero', 'mkfs'],
      allowAll: true,
    },
    network: {
      allowOutbound: true,
      allowedDomains: ['*'],
      blockedDomains: [],
    },
    autoApprove: {
      fileRead: true,
      fileWrite: true,
      commandExecution: true,
      networkAccess: true,
    },
  },
};

/**
 * Generate CLI flags for auto-approval based on permissions
 */
export function getCLIFlags(toolName: string, permissions: PermissionConfig): string[] {
  const flags: string[] = [];

  // Normalize tool name for comparison
  const tool = toolName.trim().toLowerCase();

  console.log(`[CLIPermissions] getCLIFlags called with toolName: "${toolName}" (normalized: "${tool}")`);

  // Common auto-approval flags
  if (permissions.autoApprove.fileRead && permissions.autoApprove.fileWrite) {
    // Claude CLI
    if (tool === 'claude') {
      flags.push('--dangerously-skip-permissions');
      flags.push('--print');  // Non-interactive mode
    }

    // Aider CLI (NOT Codex!)
    else if (tool === 'aider') {
      console.log('[CLIPermissions] Adding --yes for Aider');
      flags.push('--yes');
      flags.push('--no-auto-commits');
    }

    // Codex CLI - no additional flags needed (sandbox is set in adapter)
    // Important: Do NOT add any flags for codex
    else if (tool === 'codex') {
      console.log('[CLIPermissions] Codex detected - NOT adding any auto-approval flags');
      // Codex uses --sandbox flag which is already set in CodexCLIAdapter
      // Do NOT add --yes or any other flags here
    }

    // Gemini CLI
    else if (tool === 'gemini') {
      flags.push('--yolo');  // Auto-approve all actions
    }

    // Unknown tool
    else {
      console.log(`[CLIPermissions] Unknown tool: "${tool}" - no flags added`);
    }
  }

  console.log(`[CLIPermissions] Returning flags for ${toolName}:`, flags);
  return flags;
}

/**
 * Create environment variables for CLI tools to respect permissions
 */
export function getCLIEnvironment(permissions: PermissionConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Set environment flags for auto-approval
  if (permissions.autoApprove.fileRead && permissions.autoApprove.fileWrite) {
    env.CLAUDE_AUTO_APPROVE = 'true';
    env.AIDER_YES = 'true';
    env.CODEX_AUTO_APPROVE = 'true';
    env.GEMINI_AUTO_APPROVE = 'true';
  }

  // Set working directory restrictions
  if (permissions.fileSystem.allowedPaths.length > 0) {
    env.ALLOWED_PATHS = permissions.fileSystem.allowedPaths.join(':');
  }

  if (permissions.fileSystem.blockedPaths.length > 0) {
    env.BLOCKED_PATHS = permissions.fileSystem.blockedPaths.join(':');
  }

  return env;
}

/**
 * Check if a file path is allowed based on permissions
 */
export function isPathAllowed(filePath: string, permissions: PermissionConfig): boolean {
  const { allowedPaths, blockedPaths } = permissions.fileSystem;

  // Check blacklist first (highest priority)
  for (const blocked of blockedPaths) {
    const pattern = blocked.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    if (new RegExp(pattern).test(filePath)) {
      return false;
    }
  }

  // Check whitelist
  for (const allowed of allowedPaths) {
    const pattern = allowed.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    if (new RegExp(pattern).test(filePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a command is allowed based on permissions
 */
export function isCommandAllowed(command: string, permissions: PermissionConfig): boolean {
  const { allowedCommands, blockedCommands, allowAll } = permissions.terminal;

  // Check blacklist first
  for (const blocked of blockedCommands) {
    if (command.includes(blocked)) {
      return false;
    }
  }

  // If allowAll is true, allow everything not blocked
  if (allowAll) {
    return true;
  }

  // Check whitelist
  const commandBase = command.split(' ')[0];
  return allowedCommands.includes(commandBase) || allowedCommands.includes('*');
}
