# CLI-Based Agents Integration

## Overview

Tokligence Works supports **two types of agents**:

1. **API-Based Agents** - Direct LLM API calls with custom prompts
2. **CLI-Based Agents** - Wrapper around existing CLI tools (Claude Code, Gemini CLI, etc.)

This hybrid approach allows you to:
- ✅ Leverage powerful existing code tools
- ✅ Orchestrate them as team members
- ✅ Mix-and-match API and CLI agents
- ✅ Focus Tokligence on coordination, not reimplementation

## Architecture

```
Tokligence Orchestrator (Coordination Layer)
    ├── API-Based Agents
    │   ├── OpenAI GPT-4 (custom prompts)
    │   ├── Anthropic Claude (custom prompts)
    │   └── Google Gemini (custom prompts)
    │
    └── CLI-Based Agents (Wrappers)
        ├── Claude Code CLI
        ├── Gemini CLI
        └── [Future: Codex, Cursor, etc.]
```

## Supported CLI Tools

### 1. Claude Code CLI

**Installation:**
```bash
npm install -g @anthropic-ai/claude-code
```

**Configuration:**
```yaml
- id: "chloe-claude-code"
  name: "Chloe"
  role: "Frontend Developer"
  model: "claude-code/sonnet-4"  # Uses Claude Code CLI
  skills: ["React", "TypeScript"]
```

**Environment:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Gemini CLI

**Installation:**
```bash
# Install Google Cloud CLI
gcloud components install gemini
```

**Configuration:**
```yaml
- id: "bob-gemini"
  name: "Bob"
  role: "Backend Developer"
  model: "gemini-cli/pro"  # Uses Gemini CLI
  skills: ["Node.js", "API Development"]
```

**Environment:**
```bash
GOOGLE_API_KEY=AIza...
GOOGLE_CLOUD_PROJECT=your-project-id
```

### 3. Future Support

Coming soon:
- **Codex CLI** - OpenAI's code-specialized model
- **Cursor** - AI-first code editor integration
- **GitHub Copilot CLI** - GitHub's coding assistant

## Usage Example

### 1. Create a Hybrid Team

```yaml
# team-hybrid.yml
teamName: "Hybrid Development Team"
members:
  # Team Lead: API-based (for coordination)
  - id: "alex-lead"
    model: "openai/gpt-4o"
    role: "Team Lead"

  # Frontend: Claude Code CLI (for coding)
  - id: "chloe-frontend"
    model: "claude-code/sonnet-4"
    role: "Frontend Developer"

  # Backend: Gemini CLI (for coding)
  - id: "bob-backend"
    model: "gemini-cli/pro"
    role: "Backend Developer"

  # QA: API-based (for testing)
  - id: "dana-qa"
    model: "openai/gpt-4o-mini"
    role: "QA Engineer"
```

### 2. Run the Team

```bash
tokligence run SPEC.md -t team-hybrid.yml
```

### 3. Workflow

```
1. Alex (Team Lead - GPT-4 API):
   "Let's build a login page.
    @chloe-frontend please create the UI.
    @bob-backend handle the authentication API."

2. Chloe (Claude Code CLI):
   [Uses Claude Code CLI to write React component]
   "I've created LoginForm.tsx with validation."

3. Bob (Gemini CLI):
   [Uses Gemini CLI to write API endpoint]
   "Authentication endpoint ready at /api/auth."

4. Dana (GPT-4 Mini API):
   "Testing both components. Found 2 issues..."
```

## Benefits

### Why Use CLI-Based Agents?

1. **Leverage Existing Capabilities**
   - Claude Code already optimized for coding
   - Gemini CLI has specialized code understanding
   - Don't reinvent the wheel

2. **Specialized Tools**
   - Each CLI tool has unique strengths
   - Claude Code: Excellent at refactoring
   - Gemini: Great at API design
   - Mix agents based on task requirements

3. **Tokligence as Orchestration Layer**
   - Focus on coordination, not implementation
   - Task delegation and management
   - Team communication and collaboration
   - Integration with Jira, Slack, etc.

4. **Cost Optimization**
   - Use expensive models (GPT-4) for leadership
   - Use CLI tools for hands-on coding
   - Mix-and-match based on budget

## Implementation Details

### Base Class: CLIAgentBase

All CLI adapters inherit from `CLIAgentBase`:

```typescript
export abstract class CLIAgentBase implements Agent {
  // Subclasses must implement:
  protected abstract getCommand(): { command: string; args: string[] };
  protected abstract buildPrompt(context: AgentContext): string;

  // Common functionality:
  protected async sendPrompt(prompt: string): Promise<string>;
  protected parseResponse(rawResponse: string): string;
  async execute(context: AgentContext): Promise<AgentOutput>;
}
```

### Communication Flow

```
1. Orchestrator calls agent.execute(context)
   ↓
2. CLIAgentBase.buildPrompt(context) → Creates task prompt
   ↓
3. Spawn CLI process (claude-code, gemini, etc.)
   ↓
4. Send prompt via stdin
   ↓
5. Read response from stdout
   ↓
6. CLIAgentBase.parseResponse() → Clean output
   ↓
7. Return Message to Orchestrator
```

## Troubleshooting

### Claude Code Not Found

```bash
# Install globally
npm install -g @anthropic-ai/claude-code

# Verify
claude-code --version
```

### Gemini CLI Not Available

```bash
# Install Google Cloud CLI first
# Then install Gemini component
gcloud components install gemini
```

### Process Timeout

```typescript
// Adjust timeout in agent config
const response = await this.sendPrompt(prompt, workspaceDir, 180000); // 3 minutes
```

### API Key Issues

```bash
# Ensure environment variables are set
echo $ANTHROPIC_API_KEY
echo $GOOGLE_API_KEY

# Add to .env file
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

## Best Practices

1. **Use CLI Agents for Coding Tasks**
   - Frontend development
   - Backend implementation
   - Code refactoring

2. **Use API Agents for Coordination**
   - Team Lead (delegation, review)
   - Project Management
   - Communication

3. **Mix Based on Strengths**
   - Claude Code: Complex refactoring
   - Gemini CLI: API design
   - GPT-4: Architecture decisions

4. **Monitor Performance**
   - CLI tools may be slower
   - Consider timeout settings
   - Balance speed vs quality

## Comparison

| Feature | API-Based | CLI-Based |
|---------|-----------|-----------|
| **Setup** | Easy (just API key) | Requires CLI installation |
| **Speed** | Fast (direct API) | Slower (subprocess overhead) |
| **Capabilities** | Custom prompts | Tool's built-in capabilities |
| **Control** | High (full prompt control) | Medium (tool-dependent) |
| **Cost** | Per-token pricing | Per-token + CLI overhead |
| **Best For** | Coordination, planning | Hands-on coding |

## Roadmap

Future CLI agent support:
- [ ] Codex CLI adapter
- [ ] Cursor integration
- [ ] GitHub Copilot CLI
- [ ] Replit AI
- [ ] Amazon CodeWhisperer CLI
- [ ] Custom CLI tool wrapper API

## Contributing

To add a new CLI adapter:

1. Extend `CLIAgentBase`
2. Implement `getCommand()` and `buildPrompt()`
3. Add to `AgentManager` adapter registry
4. Document installation and usage
5. Submit PR with examples

See `src/agents/ClaudeCodeAdapter.ts` for reference implementation.
