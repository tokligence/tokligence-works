# Installation and Setup Guide

This guide explains how to install Tokligence Works as a global CLI tool and set it up in your projects.

## Architecture Overview

Tokligence Works follows a clean separation between the tool and your project:

```
┌─────────────────────────────────────────┐
│  Global Installation                    │
│  /usr/local/lib/node_modules/           │
│  └── tokligence-works/                  │
│      ├── Core engine                    │
│      ├── Default prompts                │
│      └── CLI commands                   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Your Project: ~/my-app/                │
│  ├── tokligence.yml      ← Team config  │
│  ├── SPEC.md             ← Project spec │
│  ├── .tokligence/        ← Local config │
│  │   ├── prompts/        ← Custom       │
│  │   ├── credentials.json               │
│  │   └── .env                           │
│  └── workspace/          ← Agent output │
└─────────────────────────────────────────┘
```

## Installation Methods

### Option 1: Global Installation (Recommended)

Install once, use everywhere:

```bash
npm install -g tokligence-works

# Verify installation
tokligence --version
tokligence --help
```

**Benefits:**
- ✅ Use `tokligence` command from anywhere
- ✅ No need to clone repo
- ✅ Automatic updates with `npm update -g`
- ✅ Clean separation of tool vs. projects

### Option 2: Local Development Installation

For contributing to the project:

```bash
git clone https://github.com/tokligence/tokligence-works.git
cd tokligence-works
npm install
npm link  # Creates global symlink to development version
```

## Project Setup

### Step 1: Initialize a New Project

Navigate to your project directory and initialize:

```bash
cd ~/my-app
tokligence init
```

**What this creates:**

```
~/my-app/
├── tokligence.yml         # Team configuration (created)
├── SPEC.md                # Project specification (template)
├── .tokligence/           # Local configuration directory
│   ├── prompts/           # Custom prompts (optional)
│   │   ├── team-lead.md
│   │   ├── team-member.md
│   │   └── general.md
│   ├── credentials.json   # Agent credentials (gitignored)
│   └── .env               # API keys (gitignored)
└── workspace/             # Agent working directory
    └── .gitkeep
```

### Step 2: Configure API Keys

Edit `.tokligence/.env`:

```bash
# LLM API Keys (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Optional: Jira Integration
JIRA_HOST=your-company.atlassian.net
JIRA_PROJECT_KEY=PROJ
```

### Step 3: Configure Your Team

Edit `tokligence.yml`:

```yaml
teamName: My Development Team
mode: time  # or: cost, quality
sandbox: guided  # or: strict, wild

members:
  - id: alex-lead
    name: Alex
    role: Team Lead
    level: senior
    model: anthropic/claude-3.5-sonnet
    skills: [architecture, delegation, code-review]
    responsibilities:
      - Task breakdown and assignment
      - Code review and quality control

  - id: chloe-frontend
    name: Chloe
    role: Frontend Developer
    level: mid-level
    model: openai/gpt-4o
    skills: [react, typescript, css, responsive-design]
```

> 💡 For CLI-based agents (e.g., `codex-cli/*`, `claude-code/*`, `gemini-cli/*`), add a `binaryPath` field or set the corresponding environment variable (`CODEX_CLI_PATH`, `CLAUDE_CLI_PATH`, `GEMINI_CLI_PATH`) so the orchestrator can locate the executable.

### Step 4: Define Your Project

Edit `SPEC.md`:

```markdown
# Project: E-commerce Checkout Flow

## Objective
Build a secure, user-friendly checkout process for our e-commerce platform.

## Requirements
- Shopping cart review
- Guest and registered user checkout
- Multiple payment methods (credit card, PayPal)
- Order confirmation email
- Mobile responsive design

## Jira Integration
Jira Project: ECOM

## Technical Constraints
- Use React 18+
- TypeScript strict mode
- Follow existing design system
- Unit test coverage > 80%
```

### Step 5: (Optional) Configure Agent Credentials

For Jira multi-account support, edit `.tokligence/credentials.json`:

```json
{
  "chloe-frontend": {
    "email": {
      "address": "chloe@company.com"
    },
    "jira": {
      "accountId": "557058:abc123",
      "apiToken": "ATATT...",
      "defaultProjects": ["ECOM", "MOBILE"]
    }
  },
  "alex-lead": {
    "email": {
      "address": "alex@company.com"
    },
    "jira": {
      "accountId": "557058:def456",
      "apiToken": "ATATT...",
      "defaultProjects": ["ECOM"]
    }
  }
}
```

**Alternative:** Use environment variables (see [Multi-Account Jira Setup](multi-account-jira-setup.md))

## Running Your Team

### Start the Orchestrator

```bash
cd ~/my-app
tokligence start
```

**What happens:**
1. Loads configuration from current directory
2. Initializes agents with specified models
3. Reads `SPEC.md` and presents to Team Lead
4. Agents begin collaborating
5. Output is written to `workspace/`

### Available Commands

```bash
# Initialize new project
tokligence init

# Start orchestrator
tokligence start

# Start with custom config
tokligence start --team custom-team.yml

# Check configuration
tokligence config validate

# Update prompts from defaults
tokligence prompts update

# Show version
tokligence --version

# Get help
tokligence --help
```

### CLI Agent Environment Variables

When using CLI-based agents you can configure executables and logging with environment variables:

| Variable | Purpose |
| --- | --- |
| `CODEX_CLI_PATH` | Override the Codex CLI binary path |
| `CLAUDE_CLI_PATH` | Override the Claude Code CLI binary path |
| `GEMINI_CLI_PATH` | Override the Gemini CLI binary path |
| `TOKLIGENCE_CLI_TIMEOUT_MS` | Set the CLI command timeout (default 45000) |
| `TOKLIGENCE_CLI_LOG_DIR` | Directory for streaming CLI logs (default `./logs`) |

## Configuration Hierarchy

Tokligence Works loads configuration in this order (higher priority overrides lower):

1. **Project Config** (`.tokligence/`)
   - Credentials, custom prompts, local .env

2. **Project Root**
   - `tokligence.yml`, `SPEC.md`

3. **User Home** (`~/.tokligence/`)
   - Global API keys, default preferences

4. **System Defaults**
   - Built-in prompts, default settings

### Example: Custom Prompts

Override default prompts by creating `.tokligence/prompts/`:

```bash
# Copy defaults to customize
tokligence prompts copy

# This creates:
# .tokligence/prompts/team-lead.md
# .tokligence/prompts/team-member.md
# .tokligence/prompts/general.md

# Edit as needed, then restart
```

## Directory Structure Explained

### `workspace/`
This is where agents write code and files. Think of it as the agent's working directory.

**Example after a session:**
```
workspace/
├── src/
│   ├── components/
│   │   ├── Checkout.tsx        # Created by Chloe
│   │   └── PaymentForm.tsx     # Created by Chloe
│   └── api/
│       └── payment.ts          # Created by Bob
├── tests/
│   └── checkout.test.ts        # Created by Dana
└── README.md                   # Updated by Alex
```

### `.tokligence/`
Local configuration **never committed to git** (automatically in `.gitignore`).

```
.tokligence/
├── credentials.json    # SENSITIVE: Agent Jira/Slack tokens
├── .env                # SENSITIVE: API keys
└── prompts/            # Optional: Project-specific prompt overrides
```

### `tokligence.yml`
**Committed to git** - Team structure without secrets.

This is your team's "blueprint" that can be shared and versioned.

## Environment Variables

### Required

At minimum, you need **one LLM provider**:

```bash
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_API_KEY=...
```

### Optional Integrations

```bash
# Jira
JIRA_HOST=company.atlassian.net
JIRA_PROJECT_KEY=PROJ

# Slack (future)
SLACK_BOT_TOKEN=xoxb-...
SLACK_WORKSPACE_ID=T...

# Custom endpoints
TOKLIGENCE_API_URL=https://api.tokligence.com
```

### Per-Agent Credentials

Instead of JSON file, use environment variables:

```bash
# Chloe's credentials
AGENT_CHLOE_FRONTEND_EMAIL=chloe@company.com
AGENT_CHLOE_FRONTEND_JIRA_ACCOUNT_ID=557058:abc123
AGENT_CHLOE_FRONTEND_JIRA_API_TOKEN=ATATT...

# Bob's credentials
AGENT_BOB_BACKEND_EMAIL=bob@company.com
AGENT_BOB_BACKEND_JIRA_ACCOUNT_ID=557058:def456
AGENT_BOB_BACKEND_JIRA_API_TOKEN=ATATT...
```

## Security Best Practices

### ✅ DO:
- Add `.tokligence/` to `.gitignore` (done automatically by `tokligence init`)
- Store API keys in `.tokligence/.env` or environment variables
- Use separate Jira tokens per agent (not shared accounts)
- Rotate tokens regularly (every 90 days)
- Use read-only tokens for testing

### ❌ DON'T:
- Commit `.tokligence/credentials.json` to git
- Share API tokens in chat or email
- Use production tokens in development
- Grant excessive Jira permissions

## Troubleshooting

### "tokligence: command not found"

**Cause:** Not installed globally or not in PATH

**Solution:**
```bash
npm install -g tokligence-works
# OR if installed locally:
npm link
```

### "No configuration found"

**Cause:** Not in a initialized project directory

**Solution:**
```bash
tokligence init
# OR specify config:
tokligence start --config /path/to/tokligence.yml
```

### "Missing API key for agent"

**Cause:** `.tokligence/.env` doesn't have required key

**Solution:**
```bash
# Check which keys are needed
tokligence config validate

# Add missing keys to .tokligence/.env
echo "OPENAI_API_KEY=sk-..." >> .tokligence/.env
```

### "Agent can't write to workspace"

**Cause:** Permission issues or workspace doesn't exist

**Solution:**
```bash
mkdir -p workspace
chmod 755 workspace
```

## Upgrading

### Upgrade Global Installation

```bash
npm update -g tokligence-works
```

### Update Project Configuration

After upgrading, update your project:

```bash
cd ~/my-app
tokligence config migrate  # Migrates old config format if needed
tokligence prompts update  # Updates to latest default prompts
```

## Multiple Projects

You can have multiple projects, each with its own configuration:

```bash
~/ecommerce-project/
├── tokligence.yml
├── SPEC.md
└── .tokligence/

~/mobile-app/
├── tokligence.yml
├── SPEC.md
└── .tokligence/

# Each project is independent
cd ~/ecommerce-project && tokligence start
cd ~/mobile-app && tokligence start
```

## Next Steps

- [Quick Start Guide](quick_start.md) - Your first session
- [Multi-Account Jira Setup](multi-account-jira-setup.md) - Jira integration
- [Custom Prompts](../prompts/) - Customize agent behavior
- [Architecture Overview](arch.md) - Understand the system

## Getting Help

- 📚 [Documentation](.)
- 💬 [Community Discussions](https://github.com/tokligence/tokligence-works/discussions)
- 🐛 [Report Issues](https://github.com/tokligence/tokligence-works/issues)
