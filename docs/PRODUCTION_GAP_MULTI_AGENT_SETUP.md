# WorkMatch Production Gap Multi-Agent Setup

This runbook turns the known "planned only" gaps into a coordinated multi-agent implementation pass.

Use this after the demo milestone. The goal is to move WorkMatch AI from a browser-side approval demo toward a production-capable internal workforce planning app while preserving the current working demo path.

## Target Gaps

The production pass finishes these gaps:

1. Excel, PDF, Word, Google Docs, and Google Sheets parsing.
2. Live model-backed AI agents and API routes.
3. Production persistence, auth, audit logs, permissions, and database-backed workflows.
4. Project roster import.
5. Match label wording such as `Strong Match (87%)`.
6. Settings controls wired into scoring, import review, and governance behavior.

## Operating Model

Run agents in parallel only where ownership is disjoint. The coordinator owns integration and final verification.

Suggested branches or worktree names:

| Agent | Branch / Worktree | Primary Ownership |
| --- | --- | --- |
| Coordinator | `coord/production-gap-integration` | Board, integration, final acceptance |
| Project Manager Agent | `agent/project-manager` | sprint plan, dependency tracking, status reports |
| Foundation Agent | `agent/foundation-runtime` | package scripts, config, env docs |
| Persistence And Governance Agent | `agent/persistence-governance` | database, auth, audit, permissions |
| Document Intake Agent | `agent/document-intake` | Excel, PDF, Word, CSV parsing pipeline |
| Google Workspace Agent | `agent/google-workspace-intake` | Google Docs and Google Sheets intake |
| AI Routes Agent | `agent/ai-routes` | model-backed routes, agent contracts, explanations |
| Roster And Assignment Agent | `agent/roster-assignment` | roster import, assignment review workflows |
| Settings And UI Wiring Agent | `agent/settings-ui-wiring` | settings state, labels, UI integration |
| Verification Agent | `agent/production-verification` | tests, smoke tests, acceptance notes |

If this folder is still not a Git repository, initialize Git before starting parallel implementation so each agent can produce reviewable diffs.

## Dependency Order

### Wave 0 - Stabilize The Base

Owner: Foundation Agent

Done when:

- `npm --version`, `npm ci`, and `npm run verify` work in a normal developer terminal.
- `.env.example` lists required keys for database, auth, OpenAI, and Google integration work.
- Build-time warnings are either fixed or tracked with an owner.

### Wave 1 - Contract And Data Foundation

Owners: Persistence And Governance Agent, AI Routes Agent

Do this before wiring UI to production APIs.

Done when:

- Database choice is confirmed and documented. Current architecture recommends Supabase Postgres.
- Core tables or migration files exist for employees, skills, tasks, imports, imported records, matches, assignments, agent runs, and audit events.
- Agent output schemas exist in code, not only docs.
- Review checkpoints are represented as typed entities.
- Audit events are emitted for import confirmation, match approval, assignment changes, settings changes, and AI route execution.

### Wave 2 - Intake Expansion

Owners: Document Intake Agent, Google Workspace Agent, Roster And Assignment Agent

Done when:

- CSV still works.
- Excel parsing imports employees and tasks from workbook sheets.
- PDF and Word parsing produce reviewable extracted records with confidence and source notes.
- Google Docs and Google Sheets can be imported through an authenticated or connector-backed flow.
- Project roster import maps employees to existing projects/tasks without bypassing manager review.

### Wave 3 - Live AI And Settings Wiring

Owners: AI Routes Agent, Settings And UI Wiring Agent

Done when:

- AI explanations, task summaries, employee summaries, and dashboard insights are generated through API routes when configured.
- Deterministic scoring remains the only source of match percentages.
- Settings controls affect the app: default priority, import confidence threshold, review requirements, audit visibility, and data source availability.
- Match labels render in the exact product wording: `Perfect Match`, `Strong Match`, `Good Match`, `Growth Match`, `Risky Match`, and `Not Recommended`.

### Wave 4 - Production Verification

Owner: Verification Agent

Done when:

- `npm run verify` passes.
- Parser tests cover CSV, Excel, PDF, Word, Google Docs, Google Sheets, and roster inputs.
- API tests cover agent route success, fallback, validation failure, and audit event creation.
- Browser smoke tests cover settings changes, import review, roster import, match approval, and AI-generated explanation fallback.

## Agent File Ownership

Keep these boundaries unless the coordinator explicitly merges scopes.

| Agent | Owns | Avoids |
| --- | --- | --- |
| Project Manager | `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`, production status docs, milestone plans, risk register | implementation files unless coordinating a handoff |
| Foundation | `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, setup docs | product logic |
| Persistence And Governance | `lib/db/*`, `lib/audit/*`, `lib/auth/*`, migrations, server-side persistence APIs | client-only demo UI unless integrating endpoints |
| Document Intake | `lib/imports/*`, parser helpers, import route handlers, sample import fixtures | settings UI, matching score logic |
| Google Workspace | Google Docs/Sheets connector routes, Google import adapters, Google-specific docs | local file parser internals |
| AI Routes | `lib/agents/*`, `app/api/agent-runs/*`, AI explanation and insight routes | deterministic scoring math |
| Roster And Assignment | roster import adapters, assignment review helpers, assignment persistence APIs | document parser internals |
| Settings And UI Wiring | `app/page.tsx`, `components/views/SettingsView.tsx`, label rendering, UI state/API wiring | migrations and parser internals |
| Verification | tests, smoke-test notes, acceptance docs | feature implementation except small test fixtures |

## Gap-To-Agent Matrix

| Gap | Primary Agent | Supporting Agents | Acceptance Signal |
| --- | --- | --- | --- |
| Excel parsing | Document Intake | Persistence, Verification | `.xlsx` employee/task fixture imports into review records |
| PDF parsing | Document Intake | AI Routes, Verification | PDF text extraction creates reviewable records or a clear fallback state |
| Word parsing | Document Intake | AI Routes, Verification | `.docx` fixture creates reviewable records with source confidence |
| Google Docs parsing | Google Workspace | Document Intake, Persistence | Google Doc source can be reviewed before commit |
| Google Sheets parsing | Google Workspace | Document Intake, Persistence | Sheet ranges map to employee/task review records |
| Live AI routes | AI Routes | Persistence, Verification | API routes return structured outputs with `agentRunId` and audit metadata |
| Persistence | Persistence And Governance | Foundation, Settings | Refreshing the page does not lose approved records |
| Auth and permissions | Persistence And Governance | Foundation | protected routes enforce role-aware access |
| Audit logs | Persistence And Governance | AI Routes, Settings | manager actions create queryable `audit_events` |
| Project roster import | Roster And Assignment | Import, Persistence | roster file maps people to projects after manager approval |
| Exact match labels | Settings And UI Wiring | Data/Matching if needed | UI renders `Strong Match (87%)`, not `Strong (87%)` |
| Settings wiring | Settings And UI Wiring | Persistence, AI Routes | settings affect scoring/import behavior and persist when configured |

## Shared Rules

- Do not let AI generate or alter match percentages.
- Do not save imported records, AI-estimated ratings, assignments, or bulk changes without manager review.
- Every model-backed output must include confidence, warnings, source references, and an `agentRunId`.
- Every persisted manager action must create an audit event.
- Every parser must return review records, not direct source-of-truth writes.
- Fallback behavior is acceptable when AI or external connectors are unavailable, but the UI must say what happened.

## Implementation Prompts

Copy one prompt per worker.

### Coordinator Prompt

You are the Coordinator Agent for the WorkMatch production gap pass. You are not alone in the codebase; do not revert edits made by other agents. Own integration sequencing, conflict resolution, acceptance tracking, and final verification. Use `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md` as the source of truth. Keep the demo path working while production features land. Finish with a status report, changed files, verification commands, and remaining risks.

### Project Manager Agent Prompt

You are the Project Manager Agent for the WorkMatch production gap pass. You are not alone in the codebase; do not revert edits made by other agents. Own milestone planning, dependency tracking, risk tracking, status reporting, and handoff discipline. Create or update a production execution board that decomposes the gaps into work packages, identifies dependencies, defines acceptance criteria, and gives each implementation agent a clear start/finish signal. Do not edit implementation files. Finish with a concise status report and the next three coordinator decisions needed.

### Foundation Agent Prompt

You are the Foundation Agent for the WorkMatch production gap pass. You are not alone in the codebase; do not revert edits made by other agents. Own developer runtime, package scripts, environment documentation, and build reliability. Inspect `package.json`, `.env.example`, `next.config.ts`, `tsconfig.json`, and setup docs. Make normal `npm run verify` the preferred path where possible, while preserving the documented bundled-Node workaround. Do not change product behavior unless setup requires it.

### Persistence And Governance Agent Prompt

You are the Persistence And Governance Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own database-backed workflows, auth boundaries, permissions, audit logs, and durable review state. Create a minimal production-ready persistence layer for employees, tasks, skills, imports, imported records, matches, assignments, settings, agent runs, and audit events. Preserve manager review before writes become authoritative. Finish with migration/schema notes and verification.

### Document Intake Agent Prompt

You are the Document Intake Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own local file ingestion for CSV, Excel, PDF, and Word. Create parser adapters that return typed import review records with confidence, issues, and source metadata. Keep CSV behavior working. Do not directly commit parsed records to source-of-truth tables; pass them through review. Add fixtures or tests where practical.

### Google Workspace Agent Prompt

You are the Google Workspace Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own Google Docs and Google Sheets intake. Build or stub connector-backed adapters that transform Docs/Sheets content into the same import review contract used by local files. Make authentication/config requirements explicit in `.env.example` and docs. Fallback gracefully when credentials or connectors are unavailable.

### AI Routes Agent Prompt

You are the AI Routes Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own model-backed API routes and `lib/agents/*`. Implement structured outputs for document extraction assistance, skill normalization, employee summaries, task summaries, match explanations, dashboard insights, and manager copilot answers. Deterministic code must remain the only source of match percentages. Store or return `agentRunId`, warnings, confidence, source references, fallback state, and audit metadata.

### Roster And Assignment Agent Prompt

You are the Roster And Assignment Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own project roster import and assignment review workflows. Implement roster parsing that links employees to existing tasks/projects by stable IDs or reviewed fuzzy matches. Manager review is required before assignments are committed. Ensure assignment approvals create audit events and update task status consistently.

### Settings And UI Wiring Agent Prompt

You are the Settings And UI Wiring Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own `SettingsView`, app-level settings state, settings persistence integration, exact match label rendering, and visible UI behavior. Wire default manager priority, confidence threshold, review requirement, audit visibility, and enabled data sources into the real app flow. Preserve the existing demo screens while moving local-only settings toward durable configuration.

### Verification Agent Prompt

You are the Verification Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own production-gap acceptance checks. Add or run tests for parsers, AI route contracts, persistence, settings behavior, roster import, and browser smoke flows. Verify that the current demo still works. Report failures with exact file paths, commands, routes, and reproduction steps.

## Coordinator Checklist

Before starting agents:

- Confirm Git status and create branches or worktrees.
- Confirm `npm ci` can run in a normal terminal.
- Ask the Project Manager Agent to maintain status, dependency, and risk tracking for this production pass.
- Decide whether persistence uses Supabase plus SQL migrations, Drizzle, Prisma, or another stack.
- Decide how Google Docs/Sheets access will be authenticated in local dev and deployed environments.
- Decide whether live AI routes use OpenAI directly or Vercel AI SDK wrappers.

Before merging an agent result:

- Review changed files against ownership boundaries.
- Confirm no agent changed deterministic score math without Data/Matching or coordinator review.
- Confirm review checkpoints are preserved.
- Run targeted tests for the changed area.

Final acceptance:

- `npm run verify` passes.
- New parser fixtures pass.
- AI route contract tests pass.
- Browser smoke test passes for Dashboard, Employees, Tasks, Matching, Imports, Settings, and roster import.
- At least one persisted audit trail shows an import confirmation, match approval, and settings change.

## Risks To Track

- PDF and Word extraction quality will vary; low-confidence extraction must remain review-only.
- Google Docs/Sheets authentication can become the critical path if credentials are not available.
- Database/auth work can break the current client-only demo if introduced too broadly.
- Live AI routes need cost and failure controls before a manager demo.
- Parallel agents can conflict in `app/page.tsx`, `ImportView.tsx`, and `lib/workmatch.ts`; coordinator should serialize changes there.

