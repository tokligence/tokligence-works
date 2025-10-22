# Quick Start Guide: Tokligence Works CLI

This guide walks you through bootstrapping the latest event-driven orchestrator, configuring a team, and running your first multi-agent session from the terminal.

## 1. Prerequisites

Install the following before you begin:

- **Node.js** (LTS version recommended)
- **npm** (bundled with Node.js)
- **Git**

## 2. Clone and Install

```bash
git clone https://github.com/tokligence/tokligence-works.git
cd tokligence-works
npm install
```

## 3. (Optional) Add Provider Keys

Tokligence Works works fine without live API keys—missing keys automatically switch the corresponding agent into a deterministic simulated mode so you can exercise the workflow offline. If you do have provider keys, place them in `.env`:

```dotenv
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIzaSy...
```

## 4. Configure Your Team (`tokligence.yml`)

`tokligence.yml` now captures delivery mode, sandbox level, and detailed role metadata. Adjust it to match your project. Example:

```yaml
teamName: "Tokligence Works Team"
mode: "time"          # cost | time | quality
sandbox: "guided"      # strict | guided | wild
members:
  - id: "alex-lead"
    name: "Alex"
    role: "Team Lead"
    level: "principal"
    model: "openai/gpt-4o"
    skills: ["Project Management", "System Design"]
    scope: "Oversee architecture, delegate work, coordinate with human."
    personality: "Decisive and pragmatic."
    responsibilities:
      - "Define architecture"
      - "Review deliverables"
  - id: "chloe-fe"
    name: "Chloe"
    role: "Frontend Developer & QA"
    level: "senior"
    model: "openai/gpt-4o-mini"
    skills: ["React", "TypeScript", "Testing"]
    scope: "Build UI components, own UX quality, maintain tests."
    personality: "Detail-oriented and user-centric."
    responsibilities:
      - "Build UI components"
      - "Maintain automated tests"
  - id: "bob-be"
    name: "Bob"
    role: "Backend Developer"
    level: "junior"
    model: "google/gemini-1.5-flash"
    skills: ["Node.js", "Express", "PostgreSQL"]
    scope: "Implement APIs, manage data layer, document changes."
    personality: "Analytical and pragmatic."
    responsibilities:
      - "Implement API endpoints"
      - "Document backend changes"
```

## 5. Define the Work (`spec.md`)

Author a Markdown spec that captures the goal for the session. Example:

```markdown
# Project Specification: Simple Web Page

## Goal
Create a simple HTML page with a title, a heading, and a paragraph of text.

## Requirements
- Title: "My Awesome Project".
- Heading: "Welcome to My Awesome Project!".
- Paragraph: Placeholder text about the project.
- Output file: `workspace/index.html`.
```

## 6. Run a Session

```bash
npm start -- run spec.md
```

### What to Expect

- The CLI initialises the session, prints agent/system events with role-based colours, and shows tool calls or “agent is thinking...” hints.
- When a model loops or returns an ambiguous response, the orchestrator halts and prints a system banner requesting human guidance.
- Auto-continue only fires when tasks remain *and* no human input is required. Type `exit` (or press `Ctrl+C`) to end the session at any time.
- All state is emitted as structured events, making it easy to plug a future web UI on top of the same backend.

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| `TSError` / `API_KEY is not set` | Ensure `.env` is populated or remove the missing key entirely (the agent will run in simulation). |
| `invalid model ID` | Correct the `model` field in `tokligence.yml` (e.g., `gpt-4o`, `claude-3-opus-20240229`, `gemini-1.5-flash`). |
| Agent repeats the same line | Watch for the system banner “Human guidance required”; provide instructions or type `exit`. |
| `Cannot find module ...` | Re-run `npm install` to ensure dependencies are installed. |

Enjoy orchestrating your AI agent team!
