# Tokligence Works Enterprise Roadmap (Internal)

> **Do not commit this file.** Enterprise roadmap items build on the OSS project but introduce paid and governance-oriented capabilities. Keep this document internal.

## Phase E1 – Service & Governance
- Multi-tenant orchestrator service with project isolation and encrypted secret storage
- RBAC with per-team/per-role permissions (view, run, write, approve)
- SSO integrations (Okta, Azure AD) and audit log streaming

## Phase E2 – Workflow Integrations
- Deep Git integration (PR creation, branch policies, reviewer assignment)
- Jira / Linear bi-directional sync (create tickets, update status from agents)
- CI/CD hooks (trigger Jenkins/GitHub Actions and parse results back into the session)

## Phase E3 – Advanced Productivity
- Auto-pilot playbooks with KPI dashboards and SLA alerts
- Cost analytics (per-agent, per-project) with billing exports
- Memory vaults shared across teams with semantic search and retention policies

## Phase E4 – Ecosystem & Custom Roles
- Non-engineering agent packs (Marketing, Success, Compliance) with curated prompts and permission models
- Plugin marketplace for tool adapters and workflow rituals
- API rate-limit management and throttling policies per organization

Maintain this file privately; keep the public `docs/roadmap.md` focused on the OSS path.
