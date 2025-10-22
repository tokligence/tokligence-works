# CLI Agent Permissions System

## Overview

CLI-based agents (Claude Code, Codex, Gemini) often require interactive permissions for file access and command execution. The permission system provides **whitelist/blacklist** controls to reduce these interruptions.

## Sandbox Modes

Three modes control permission levels:

### 1. `strict` - Maximum Security
```yaml
sandbox: "strict"
```

**Auto-approves:**
- ✅ File reads in workspace
- ❌ File writes (requires approval)
- ❌ Command execution (requires approval)
- ❌ Network access

**Allowed paths:**
- `workspace/**` only

**Blocked paths:**
- `~/.ssh/**`, `~/.aws/**`, `/etc/**`, `*.env`

**Allowed commands:**
- `npm`, `git`, `node`, `python`, `pip`

**Blocked commands:**
- `rm -rf`, `sudo`, `curl`, `wget`

### 2. `guided` - Balanced (Default)
```yaml
sandbox: "guided"
```

**Auto-approves:**
- ✅ File reads
- ✅ File writes in allowed paths
- ✅ Allowed command execution
- ✅ Network access

**Allowed paths:**
- `workspace/**`, `src/**`, `tests/**`, `docs/**`

**Blocked paths:**
- `~/.ssh/**`, `~/.aws/**`, `/etc/**`, `*.env`, `credentials.*`

**Allowed commands:**
- `npm`, `yarn`, `node`, `python`, `git`, `docker`, `make`
- `ls`, `cat`, `grep`, `find`

**Blocked commands:**
- `rm -rf /`, `sudo`, `su`, `dd`, `mkfs`

### 3. `wild` - Maximum Freedom
```yaml
sandbox: "wild"
```

**Auto-approves:**
- ✅ All file operations
- ✅ All commands (except destructive system commands)
- ✅ Network access

**Blocked paths:**
- `/System/**`, `/Windows/**` (system protection only)

**Blocked commands:**
- `rm -rf /`, `dd if=/dev/zero`, `mkfs` (catastrophic commands only)

## Usage

### Basic Configuration

In your `team-cli-hybrid.yml`:

```yaml
teamName: "My Team"
mode: "time"
sandbox: "guided"  # ← Set sandbox mode here

members:
  - id: "chloe-claude-code"
    name: "Chloe"
    model: "claude-code/sonnet-4"
    # ... other config
```

All CLI agents will use the team's sandbox mode.

### How It Works

When you start a CLI agent with `sandbox: "guided"`:

```bash
# Without permissions system:
claude
> ⚠️ Allow file write to workspace/login.tsx? [y/n]
> ⚠️ Allow command execution: npm install? [y/n]
> ⚠️ Allow file write to src/api.ts? [y/n]

# With permissions system:
claude --dangerouslySkipApproval
✅ Auto-approved: write workspace/login.tsx
✅ Auto-approved: execute npm install
✅ Auto-approved: write src/api.ts
```

### CLI Flags Generated

The system automatically adds appropriate flags:

| CLI Tool | Flags Added |
|----------|-------------|
| `claude` | `--dangerouslySkipApproval`, `--cwd workspace` |
| `codex` | `--yes`, `--no-auto-commits` |
| `gemini` | `--auto-approve` |

## Custom Permissions

You can override default permissions (advanced):

```typescript
import { PermissionConfig } from './agents/CLIPermissions';

const customPermissions: PermissionConfig = {
  sandboxMode: 'guided',
  fileSystem: {
    allowedPaths: ['workspace/**', 'my-custom-dir/**'],
    blockedPaths: ['workspace/secrets/**'],
    allowRead: true,
    allowWrite: true,
    allowDelete: false,
  },
  terminal: {
    allowedCommands: ['npm', 'git', 'docker'],
    blockedCommands: ['rm', 'sudo'],
    allowAll: false,
  },
  network: {
    allowOutbound: true,
    allowedDomains: ['github.com', 'npmjs.com'],
    blockedDomains: [],
  },
  autoApprove: {
    fileRead: true,
    fileWrite: true,
    commandExecution: true,
    networkAccess: false,  // Still ask for network
  },
};
```

## Security Best Practices

### 1. Start with `guided` mode
```yaml
sandbox: "guided"
```
Good balance between automation and security.

### 2. Use `strict` for sensitive projects
```yaml
sandbox: "strict"
```
When working with production code or sensitive data.

### 3. Never use `wild` with untrusted code
```yaml
sandbox: "wild"  # ⚠️ Only for trusted, isolated environments
```

### 4. Always block sensitive paths
```yaml
# Default blocked paths (already included):
blockedPaths:
  - "~/.ssh/**"
  - "~/.aws/**"
  - "*.env"
  - "credentials.*"
  - "id_rsa*"
```

### 5. Review logs
```bash
# Permission decisions are logged
[Chloe] Starting claude with auto-approval flags: [ '--dangerouslySkipApproval', '--cwd', 'workspace' ]
```

## Comparison

### Before (Manual Approvals)
```
👨‍💼 Alex: @chloe-claude-code create login.tsx
👩‍💻 Chloe: Starting...
> ⚠️ Allow file write? [y/n] █
[WAITING FOR USER INPUT]
> ⚠️ Allow command npm install? [y/n] █
[WAITING FOR USER INPUT]
> ⚠️ Allow file read .env? [y/n] █
[WAITING FOR USER INPUT]
```

### After (Auto-Approved)
```
👨‍💼 Alex: @chloe-claude-code create login.tsx
👩‍💻 Chloe: Starting with auto-approval...
✅ Created workspace/login.tsx
✅ Installed dependencies
❌ Blocked: read .env (blacklisted)
👩‍💻 Chloe: Login component completed!
```

## Troubleshooting

### CLI still asking for permissions

**Problem:** CLI tool ignoring auto-approval flags

**Solutions:**
1. Check CLI tool supports the flags:
   ```bash
   claude --help | grep approval
   codex --help | grep yes
   ```

2. Update CLI tool to latest version:
   ```bash
   npm update -g @anthropic-ai/claude-code
   ```

3. Set environment variables manually:
   ```bash
   export CLAUDE_AUTO_APPROVE=true
   export AIDER_YES=true
   ```

### Permission denied errors

**Problem:** CLI blocked from accessing needed files

**Solution:** Adjust sandbox mode or add to whitelist:
```yaml
sandbox: "wild"  # Temporary workaround
```

Or customize permissions (see Custom Permissions section).

### Commands being blocked

**Problem:** Legitimate command blocked by blacklist

**Solution:** Use `guided` or `wild` mode:
```yaml
sandbox: "guided"  # Allows more commands
```

## Environment Variables

The system sets these for CLI tools:

```bash
# Auto-approval
CLAUDE_AUTO_APPROVE=true
AIDER_YES=true
CODEX_AUTO_APPROVE=true
GEMINI_AUTO_APPROVE=true

# Path restrictions
ALLOWED_PATHS=workspace/**:src/**:tests/**
BLOCKED_PATHS=~/.ssh/**:*.env
```

## Summary

| Mode | Use Case | Auto-Approval | Safety |
|------|----------|---------------|---------|
| **strict** | Production, sensitive data | Minimal | 🛡️🛡️🛡️ |
| **guided** | Development, standard projects | Balanced | 🛡️🛡️ |
| **wild** | Experimentation, isolated env | Maximum | 🛡️ |

**Recommendation:** Start with `guided`, adjust based on needs.
