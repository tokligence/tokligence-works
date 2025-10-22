# Tokligence Works: Multi-Agent AI Collaboration Platform

![Tokligence Works Logo Placeholder](https://via.placeholder.com/150x50?text=Tokligence+Works)

Tokligence Works is an event-driven orchestration platform that lets you spin up multi-role AI engineering teams from the terminal. Each agent can be backed by a live LLM (OpenAI, Anthropic, Google Gemini) or a deterministic simulator, all coordinated by a stateful scheduler that handles delegation, reviews, and tool usage.

## Features (MVP)

- **Event-Driven Scheduling:** Sessions run through a `SessionManager` + `Scheduler`, so agent turns are queued explicitly (no recursive loops).
- **Sandboxed ToolService:** All file and terminal access flows through a single sandbox-aware ToolService with strict/guided/wild modes.
- **Role-Aware Teams:** `team.yml` now captures level, responsibilities, cost hints, and preferred models for each agent.
- **Automatic Simulation Fallback:** Missing API keys trigger a deterministic adapter so workflows remain testable offline.
- **CLI Collaboration Loop:** Improved colours, duplicate-response detection, and “human input required” pauses make the terminal UX predictable and ready for a future web client.
- **Web-Ready Events:** All state changes flow through typed events, which can be streamed to a forthcoming WebSocket API.

## Architecture Overview

Tokligence Works is organised around three core services:

1. **SessionManager** – tracks topics, delivery modes (cost/time/quality), sandbox levels, and the rolling event log.
2. **Scheduler** – consumes events, dispatches agent turns, enforces review chains, and surfaces “human input required” states.
3. **ToolService** – mediates file/terminal commands with sandbox policies and an audit trail.

The CLI is a thin client that subscribes to event streams; the same backend can expose a WebSocket endpoint for a web UI. Detailed diagrams live in [arch.md](./arch.md) and [docs/refactor-plan.md](./docs/refactor-plan.md).

## Technology Stack (MVP)

- **Language:** TypeScript / Node.js
- **CLI Framework:** Commander.js
- **Configuration:** YAML (js-yaml)
- **Orchestration:** Custom (inspired by LangGraph principles)
- **Agent SDKs:** OpenAI, Anthropic, @google/generative-ai
- **Utilities:** Chalk (for colored output), dotenv (for environment variables)
- **Testing:** Jest

## Installation

To get started with Tokligence Works, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tokligence/tokligence-works.git
    cd tokligence-works
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Usage

For step-by-step setup (configuring `team.yml`, `.env`, and running your first session) see the updated [Quick Start Guide](./docs/quick_start.md).

## Roadmap

Upcoming milestones include exposing the orchestrator over WebSocket, introducing memory plugins (RAG/SQLite), expanding the tool catalogue, and integrating with delivery tooling (Jira/Git). Track progress in the [Roadmap](./docs/roadmap.md).

## Contributing

We welcome contributions! Please see our `CONTRIBUTING.md` (coming soon) for guidelines.

## License

Tokligence Works is licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE) file for details.
