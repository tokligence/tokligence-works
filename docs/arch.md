# Tokligence Works - System Architecture (Refined)

This document captures the current architecture of Tokligence Works after the MVP refactor. The orchestrator now runs on an event-driven core with explicit session state, level-aware scheduling, and sandboxed tooling. The same backend can power the CLI today and, via WebSocket, future web or chat clients.

## Objectives
- Replace the previous recursive orchestration loop with a queue-based scheduler so multi-agent collaboration stays controllable and debuggable.
- Introduce a formal `SessionManager` to track topics, delivery/sandbox modes, and (eventually) short/long-term memory summaries.
- Route all workspace access through a `ToolService` with configurable safety policies (`strict`, `guided`, `wild`).
- Expand team configuration so roles carry level, responsibilities, and cost hints, enabling realistic delegation/review flows.
- Support OpenAI / Anthropic / Google Gemini, while falling back to deterministic simulation whenever a key is missing.

## High-Level View
```
+------------------+        WebSocket / CLI        +--------------------+
|   Human Client   | <---------------------------> |  Session Gateway   |
|  (CLI, future)   |                               |  (Orchestrator)    |
+------------------+                               +----------+---------+
                                                              |
                                                              v
                                                     +----------------+
                                                     | Event Bus      |
                                                     | (in-memory)    |
                                                     +--------+-------+
                                                              |
     +--------------------------------------+------------------+-------------------------+
     |                                      |                                          |
     v                                      v                                          v
+-------------+                    +-----------------+                     +------------------+
| Session     |                    | Scheduler       |                     | ToolService      |
| Manager     |                    | (Turn Queue)    |                     | (Sandbox Modes)  |
| - Topics    | <---- context ---- | - Delegation    | <---- tool events-->| - FileSystem     |
| - Modes     |                    | - Review chain  |                     | - Terminal       |
+-------------+                    +-----------------+                     +------------------+
      |                                    |                                          |
      | context                            v                                          v
      |                            +-----------------+                      +------------------+
      +--------------------------> | Agent Adapters  |                      | Workspace (FS)   |
                                   | - OpenAI        |                      | + audit trail    |
                                   | - Gemini        |                      +------------------+
                                   | - Simulated     |
                                   +-----------------+
```

## Core Components

### SessionManager
- Stores the current `SessionState` (team config, spec, delivery mode, sandbox level).
- Persists `TopicState`s: ordered `ConversationEvent`s, active assignee, rolling summaries (future).
- Key APIs: `appendEvent`, `getRecentEvents(topicId, limit)`, `updateTopicStatus(topicId, status)`.

### Scheduler
- Maintains a timestamp-sorted queue of `ScheduledTask`s consumed in `runLoop`.
- MVP strategies: initial turn goes to the Team Lead, `@mentions` enqueue referenced agents, junior output triggers senior/principal review, and non-lead agents without hand-off route back to the lead.
- Hooks for delivery modes (`cost`, `time`, `quality`) let us adapt priority and review depth in future releases.

### ToolService
- Single entrypoint `execute(toolName, payload, { sandboxLevel })` wrapping filesystem/terminal tools.
- Enforces sandbox policies (strict/guided/wild), validates commands, auto-creates parent directories, logs duration and results.
- All tool calls feed back into the session as `tool_result` events.

### Agent Adapter Layer
- OpenAI / Anthropic / Google Gemini adapters lazily instantiate SDKs and embed team context (role, level, responsibilities, delivery mode, sandbox level) into prompts.
- Missing API keys automatically swap the agent in for a `SimulatedAdapter`, allowing deterministic dry runs.
- Adapter responses enter the scheduler as `message`, `tool_call`, or `handoff` events.

### CLI Client
- Streams `message`, `agentThinking`, and `toolCalling` events.
- Role-based colours improve readability; duplicate-response detection pauses the loop and signals “human input required”.
- The CLI is intentionally thin so the same event feed can power a forthcoming web dashboard or chat integration.

## Team Configuration Example
```yaml
teamName: "Tokligence Works Demo"
mode: "time"          # cost | time | quality
sandbox: "guided"      # strict | guided | wild
members:
  - id: alex-lead
    name: Alex
    role: Team Lead
    level: principal
    model: openai/gpt-4o
    costPerMinute: 0.6
    responsibilities:
      - define architecture
      - approve releases
  - id: chloe-fe
    name: Chloe
    role: Frontend Developer & QA
    level: senior
    model: openai/gpt-4o-mini
    costPerMinute: 0.3
    responsibilities:
      - implement UI
      - write unit tests
  - id: bob-be
    name: Bob
    role: Backend Developer
    level: junior
    model: google/gemini-1.5-flash
    costPerMinute: 0.15
    responsibilities:
      - implement API endpoints
      - document changes
```
The scheduler uses `level` to determine review order; delivery mode and sandbox level apply globally per session (subject to future per-topic overrides).

## Data Model Snapshot
```ts
type DeliveryMode = 'cost' | 'time' | 'quality';
type SandboxLevel = 'strict' | 'guided' | 'wild';

type ConversationEvent =
  | { kind: 'message'; authorId: string; topicId: string; body: string; mentions?: string[] }
  | { kind: 'tool_call'; agentId: string; topicId: string; tool: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; topicId: string; result: ToolResult }
  | { kind: 'handoff'; topicId: string; from: string; to: string; reason: string }
  | { kind: 'status'; topicId: string; status: TopicStatus }
  | { kind: 'human_input'; topicId: string; authorId: string; name: string; role: string; body: string };

interface TopicState {
  id: string;
  title: string;
  summary: string;
  events: ConversationEvent[];
  activeAssignee?: string;
  status: TopicStatus;
}
```

## Delivery Modes & Sandbox Levels

| Mode     | Bias                         | Behaviour Sketch                                                  |
|----------|------------------------------|--------------------------------------------------------------------|
| cost     | Minimise token/tool spend    | Prefer cheaper models, defer reviews unless risk is high.         |
| time     | Default for MVP              | Moderate parallelism, guided sandbox, short review chain.         |
| quality  | Maximise reliability         | Enforce multi-level review and testing before completion.         |

| Sandbox | Description                                   | Typical Use |
|---------|-----------------------------------------------|-------------|
| strict  | Locked-down commands/files, safest option      | Regulated / production workloads |
| guided  | Balanced defaults, interprets risk heuristics | MVP default |
| wild    | Allow all except blacklist (logs everything)  | Fast prototyping / trusted env |

## Implementation Phases
- **Phase A – Infrastructure**: SessionManager, EventBus, asynchronous CLI wiring, new `ConversationEvent` structures.
- **Phase B – ToolService**: Sandbox-aware execution + audit trail.
- **Phase C – Scheduler Rules**: Mentions, level-based review routing, delivery mode hooks.
- **Phase D – Adapters & Simulation**: Lazy SDK instantiation, `SimulatedAdapter`, enriched prompts.
- **Phase E – Testing & Docs**: Jest coverage for session/scheduler/tools and public Quick Start docs.

## Risks & Mitigations
- **Complexity creep** → keep MVP to single-session, in-memory event bus; advanced features live behind interfaces.
- **Token usage** → summarise per-topic history, allow adapter-level truncation.
- **Sandbox bypass** → maintain destructive-command blacklist, enforce timeouts, log every action.
- **API key gaps** → deterministic simulation ensures workflows never fail due to missing credentials.

## Open Questions
- Preferred long-term memory backend (SQLite + embeddings vs. managed vector stores).
- Surface area for cost/time analytics (session summaries vs. external dashboard).
- Persisting sessions beyond process lifetime (JSON export / DB store).

## Extensibility Roadmap
- Memory plugins for short/long-term recall.
- WebSocket gateway + web dashboard.
- Additional agent roles (e.g., compliance, marketing) with tailored prompts and permissions.
- Cost analytics combining `costPerMinute` and tool usage telemetry.

## Diagram Legend
- Blue boxes: runtime processes/services.
- Orange arrows: event flow via the scheduler.
- Grey boxes: external resources (LLM APIs, filesystem).

---
Implementation references:
- Session state: `src/session/SessionManager.ts`
- Scheduling: `src/scheduler/Scheduler.ts`
- Tool execution: `src/tools/ToolManager.ts`
- Orchestrator loop: `src/orchestrator/Orchestrator.ts`
