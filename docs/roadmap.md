# Tokligence Works OSS Roadmap

The open-source edition focuses on a highly capable CLI orchestrator that anyone can run locally. We ship in iterative phases so core collaboration features land first, while leaving room for the forthcoming service/API extras.

## ✅ Phase 0 – Foundations (completed)
- Event-driven orchestrator (`SessionManager` + `Scheduler`)
- Sandboxed ToolService (strict/guided/wild)
- Role-aware team configuration (`team.yml` with level/responsibilities)
- Automatic simulated fallback when API keys are absent
- Improved CLI experience (role colours, human-input pauses, duplicate detection)

## 🚧 Phase 1 – OSS Enhancements (in progress)
- **WebSocket bridge (read-only)**: Stream session events so alternative clients (web UI, Slack bot prototypes) can consume them.
- **Memory plugin interface**: Pluggable short/long-term memory (initial SQLite + embeddings reference implementation).
- **Expanded tool catalogue**: File diff tool, JSON writer, simple HTTP fetcher with sandbox policies.
- **Team templates**: Predefined `team.yml` snippets for common workflows (frontend-focused, backend-focused, full-stack).
- **Workspace snapshots**: Optional `--snapshots` flag to export the workspace state at key milestones.

## 🔭 Phase 2 – OSS Road to 1.0 (planned)
- **Configurable delivery modes**: Make `cost/time/quality` strategies tunable (parallelism caps, review depth, tool usage budgets).
- **Scenario testing**: Add `npm run verify` harness that replays canned specs to assert orchestrator behaviour.
- **CLI UX polish**: Command palette for common actions (`/summary`, `/show team`, `/help`) and richer status banners.
- **Documentation lift**: Full API reference for session events, tool contracts, and adapter interfaces.

## 🧪 Community Ideas Backlog
These are being discussed in GitHub issues—contributions welcome!
- Local vector memory providers (Chroma, LanceDB)
- Additional provider adapters (local LLMs via Ollama, Bedrock, Vertex)
- Scriptable “rituals” (e.g., run tests after every file write)
- Better transcript exports (Markdown/JSON)


