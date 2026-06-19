# WorkMatch Production Execution Board

Last updated: June 10, 2026

Source of truth: `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`

This board coordinates the production gap pass after the demo milestone. The goal is to move WorkMatch from a browser-side approval demo toward a production-capable internal workforce planning app while preserving the current demo path.

## Current Coordinator Snapshot

| Area | Status | Owner | Notes |
| --- | --- | --- | --- |
| Production board | Complete | Project Manager Agent | This file decomposes work packages, dependencies, acceptance criteria, and risks. |
| Git coordination | Constrained | Coordinator | This workspace is not currently a Git repository. Continue with strict file ownership and serialize high-conflict files until the user decides whether to initialize Git. |
| Normal npm verification | Blocked in Codex shell | Foundation Agent | Foundation confirmed `npm` is unavailable on PATH here; bundled-Node checks are documented in `docs/PRODUCTION_RUNTIME_BASELINE.md`. |
| Demo path | Preserve | All agents | No production change should break Dashboard, Employees, Tasks, Matching, Imports, or the existing CSV review path. |
| Production implementation | Started | Implementation agents | First-wave scaffolds exist for runtime, persistence/governance, and AI agent contracts. |

## Coordinator Defaults - June 10, 2026

- Repository control: no Git initialization yet; use strict file ownership and coordinator serialization.
- Persistence stack: Supabase/Postgres-compatible contracts first; defer Drizzle/Prisma choice until a real database connection is introduced.
- AI route surface: provider-neutral request/schema layer first, OpenAI direct API compatibility for the first live provider path.
- Google Workspace path: shared import review adapters with credential/connector fallback until Google access is available.

## Execution Waves

| Wave | Gate | Owners | Start Signal | Finish Signal |
| --- | --- | --- | --- | --- |
| Wave 0 - Coordination and runtime base | Required before broad parallel work | Coordinator, Foundation | Coordinator decides Git/repo approach and Foundation confirms install/verify path. | `npm ci` and `npm run verify` work in a normal terminal, or the documented bundled-Node fallback is confirmed; `.env.example` covers database, auth, OpenAI, and Google settings. |
| Wave 1 - Contracts and durable data foundation | Required before UI calls production APIs | Persistence And Governance, AI Routes | Database/auth/AI wrapper decisions are recorded. | Core data model, review entities, agent output schemas, and audit-event contract exist in code. |
| Wave 2 - Intake and roster expansion | Parallel after shared import contract exists | Document Intake, Google Workspace, Roster And Assignment | Import review contract and persistence handoff are stable. | CSV still works; Excel/PDF/Word/Google Docs/Google Sheets/roster inputs produce review records without direct authoritative writes. |
| Wave 3 - Live AI and settings wiring | Parallel after schemas and persistence endpoints stabilize | AI Routes, Settings And UI Wiring | Agent schemas and settings persistence contract are available. | Model-backed routes work when configured; deterministic match percentages remain code-owned; settings affect scoring, import review, governance, and visible UI behavior. |
| Wave 4 - Production verification | Final integration gate | Verification, Coordinator | Implementation packages report complete or blocked with exact evidence. | `npm run verify` passes; targeted parser/API/persistence/settings/roster tests pass; browser smoke covers the core demo and production flows. |

## Work Packages

| ID | Package | Primary Owner | Supporting Owners | Dependencies | Acceptance Criteria | Current Status |
| --- | --- | --- | --- | --- | --- | --- |
| WP0 | Repository and runtime control | Foundation Agent | Coordinator, Verification | None, but blocked by non-Git workspace decision | Git or worktree strategy is usable; `npm --version`, `npm ci`, and `npm run verify` work in a normal developer terminal; fallback commands are documented if Codex shell PATH remains limited. | Partial: runtime fallback documented; Git remains undecided. |
| WP1 | Environment and production config baseline | Foundation Agent | Persistence, AI Routes, Google Workspace | WP0 | `.env.example` lists database, auth, OpenAI, Google, and storage variables; build-time warnings are fixed or assigned; package scripts remain stable. | Complete for baseline env/docs. |
| WP2 | Review and import record contract | Persistence And Governance Agent | Document Intake, Google Workspace, Roster And Assignment, AI Routes | Database stack decision; WP1 preferred | Typed review entities exist for employees, tasks, roster rows, source metadata, confidence, issues, and manager decision state; no parser writes directly to source-of-truth tables. | Partial: typed scaffold exists; parser adapters still need to consume it. |
| WP3 | Core persistence, auth, permissions, and audit | Persistence And Governance Agent | Foundation, Settings, Verification | WP1, database stack decision | Tables or migrations exist for employees, skills, tasks, imports, imported records, matches, assignments, settings, agent runs, and audit events; role-aware access is enforced; manager actions emit audit events. | Partial: DB/auth/audit contracts exist; no live database client or migrations yet. |
| WP4 | Local document intake: CSV, Excel, PDF, Word | Document Intake Agent | Persistence, AI Routes, Verification | WP2 import contract | CSV remains compatible; Excel workbook sheets import employees and tasks; PDF and Word extraction create review records with confidence, issues, and source notes; low-confidence extraction remains review-only. | Ready for second wave. |
| WP5 | Google Docs and Google Sheets intake | Google Workspace Agent | Document Intake, Persistence, Foundation | WP2 import contract; Google auth decision | Google Docs and Sheets content transforms into the shared review contract through authenticated or connector-backed flow; unavailable credentials produce clear fallback behavior; config requirements are documented. | Ready for second wave with fallback-first approach. |
| WP6 | Live model-backed AI routes | AI Routes Agent | Persistence, Document Intake, Verification | WP1, WP2, AI provider/wrapper decision | Routes return structured outputs for extraction assistance, skill normalization, employee/task summaries, match explanations, dashboard insights, and manager copilot answers; each response includes `agentRunId`, confidence, warnings, source references, fallback state, and audit metadata. | Partial: contracts, schemas, request builders, and fallbacks exist; live route handlers still needed. |
| WP7 | Project roster import and assignment review | Roster And Assignment Agent | Persistence, Document Intake, Settings, Verification | WP2, WP3 | Roster imports map employees to existing tasks/projects by stable IDs or reviewed fuzzy matches; manager review is required before assignments commit; assignment approval updates task state and creates audit events. | Ready for second wave scaffold. |
| WP8 | Settings persistence and UI behavior wiring | Settings And UI Wiring Agent | Persistence, AI Routes, Verification | WP3; WP6 for AI-dependent settings | Settings affect default manager priority, import confidence threshold, review requirements, audit visibility, and enabled data sources; settings persist when configured; exact match labels render as `Perfect Match`, `Strong Match`, `Good Match`, `Growth Match`, `Risky Match`, and `Not Recommended` with percentages. | Partial: exact match label formatter landed; settings wiring still needed. |
| WP9 | Production verification suite and smoke flow | Verification Agent | All agents | At least one completed implementation package | Parser tests cover CSV, Excel, PDF, Word, Google Docs, Google Sheets, and roster inputs; API tests cover success, fallback, validation failure, and audit creation; browser smoke covers settings changes, import review, roster import, match approval, and AI fallback. | Ready to design now; execution follows each package. |
| WP10 | Integration and release acceptance | Coordinator | Project Manager, Verification, All agents | WP0-WP9 | Changed files respect ownership boundaries; deterministic scoring remains the only source of percentages; review checkpoints are preserved; final acceptance checklist in the setup doc passes. | Not started. |

## Dependency Order

1. Resolve coordination base: decide Git/repo handling, then confirm package manager and verify commands.
2. Decide production platform choices: database/auth stack, Google Docs/Sheets access model, and AI route implementation wrapper.
3. Build shared contracts before features: import review records, agent output envelopes, audit event shape, and settings schema.
4. Parallelize disjoint implementation after contracts land:
   - Document Intake can own Excel/PDF/Word.
   - Google Workspace can own Docs/Sheets.
   - Roster And Assignment can own roster parsing and assignment review.
   - AI Routes can own model-backed routes and agent run records.
   - Settings And UI Wiring can own settings behavior and labels.
5. Verify continuously with targeted tests, then run the full production acceptance sweep.

## Agent Start And Finish Signals

| Agent | Start Signal | Finish Signal |
| --- | --- | --- |
| Foundation | Coordinator confirms whether to initialize Git here or work elsewhere. | Normal verification path works or fallback is documented; `.env.example` is production-gap ready. |
| Persistence And Governance | Database/auth decision is recorded. | Durable entities, permissions, audit events, review checkpoints, and settings storage are implemented with migration/schema notes. |
| Document Intake | Shared import review contract is available. | CSV, Excel, PDF, and Word adapters return review records and targeted parser tests pass. |
| Google Workspace | Google access model is chosen. | Docs/Sheets adapters use the shared contract and fail gracefully without credentials. |
| AI Routes | AI provider/wrapper decision and output envelope are available. | Live or configured fallback routes return structured outputs with `agentRunId` and audit metadata. |
| Roster And Assignment | Review contract and assignment persistence model are available. | Roster import creates reviewed assignment candidates and approved assignments emit audit events. |
| Settings And UI Wiring | Settings persistence/API contract is available. | Settings visibly affect app behavior and persist; labels use exact production wording. |
| Verification | Each package publishes changed files and acceptance notes. | Full verify, targeted tests, and browser smoke results are recorded with failures reproduced. |

## Acceptance Checklist

| Acceptance Item | Owner | Evidence Needed | Status |
| --- | --- | --- | --- |
| Normal install and verify path works | Foundation | Command output for `npm --version`, `npm ci`, `npm run verify` | Not started |
| Database choice and schema are documented | Persistence | Migration/schema files plus notes | Blocked by decision |
| Auth and role-aware permissions exist | Persistence | Protected route/API behavior and tests | Blocked by decision |
| Audit events are queryable | Persistence | Audit rows for import confirmation, match approval, assignment change, settings change, and AI route execution | Not started |
| CSV remains working | Document Intake, Verification | Existing sample employee/task CSVs still import through review | Not started |
| Excel parsing works | Document Intake | Workbook fixture imports employees/tasks into review records | Not started |
| PDF parsing works | Document Intake | PDF fixture creates reviewable records or clear fallback | Not started |
| Word parsing works | Document Intake | `.docx` fixture creates reviewable records with source confidence | Not started |
| Google Docs import works or falls back clearly | Google Workspace | Authenticated/connector-backed flow or explicit unavailable state | Blocked by decision |
| Google Sheets import works or falls back clearly | Google Workspace | Sheet range mapping into review records | Blocked by decision |
| Live AI routes are structured and audited | AI Routes | API tests for success, fallback, validation failure, audit creation | Blocked by decision |
| Deterministic percentages remain code-owned | AI Routes, Settings, Verification | Test or review showing AI never supplies match percentages | Not started |
| Roster import requires manager review | Roster And Assignment | Roster fixture and approval flow evidence | Not started |
| Settings affect real behavior | Settings And UI Wiring | Tests or smoke notes for priority, confidence threshold, review requirements, audit visibility, and data source availability | Not started |
| Exact match label wording renders | Settings And UI Wiring | UI evidence for labels like `Strong Match (87%)` | Not started |
| Browser smoke covers production flows | Verification | Smoke notes for Dashboard, Employees, Tasks, Matching, Imports, Settings, roster import, match approval, AI fallback | Not started |

## Parallel Work Rules

- Keep implementation agents inside their ownership areas from `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`.
- Serialize changes to high-conflict files such as `app/page.tsx`, `components/views/ImportView.tsx`, and `lib/workmatch.ts`.
- Do not let AI generate or alter match percentages.
- Do not save imported records, AI-estimated ratings, assignments, or bulk changes without manager review.
- Every model-backed output must include confidence, warnings, source references, and an `agentRunId`.
- Every persisted manager action must create an audit event.
- Every parser must return review records, not direct source-of-truth writes.
- Fallback behavior is acceptable when AI or external connectors are unavailable, but the UI must say what happened.

## Handoff Format

Each implementation agent should finish with:

```text
Status: complete | partial | blocked
Package IDs:
- WP#

Files changed:
- path/to/file

What changed:
- Short summary

Verification:
- Commands, tests, or browser flows run

Acceptance evidence:
- Which acceptance criteria passed

Risks / follow-up:
- Anything the coordinator should know
```

## Top Risks

| Risk | Impact | Owner | Mitigation |
| --- | --- | --- | --- |
| Workspace is not a Git repository | Parallel agents cannot safely branch, diff, or merge. | Coordinator | Decide whether to initialize Git in this workspace or move agents to a repository checkout before implementation begins. |
| Database/auth stack is undecided | Persistence, settings, audit, and API contracts may drift. | Coordinator, Persistence | Confirm Supabase Postgres plus auth, or choose an alternative before WP2/WP3. |
| Google Docs/Sheets credentials may be unavailable | Google Workspace intake can become the critical path. | Coordinator, Google Workspace | Pick connector-backed, OAuth, service account, or stub-first flow and require clear fallback behavior. |
| Live AI route approach is undecided | AI routes, cost controls, and provider-specific schemas may be reworked. | Coordinator, AI Routes | Decide OpenAI direct API versus Vercel AI SDK wrappers before WP6. |
| PDF and Word extraction quality varies | Low-confidence records could pollute production data. | Document Intake, Verification | Require confidence, source notes, warnings, and manager review before commit. |
| Production persistence could break the demo path | Existing browser-side demo could regress. | Persistence, Settings, Coordinator | Add durable workflows behind contracts and keep demo fallback paths until final acceptance. |
| High-conflict UI/data files overlap | Parallel agents can overwrite each other in app shell, imports, matching, or settings. | Coordinator | Serialize edits to known hotspots and require changed-file handoffs before merge. |
| AI outputs could imply authoritative scoring | Match percentages could become non-deterministic or unexplainable. | AI Routes, Verification | Enforce route contracts that explain but never generate match percentages. |

## Next Coordinator Decisions Needed

1. Decide whether to initialize Git in this workspace before broader implementation continues.
2. Decide when to introduce a live Supabase client/migrations versus keeping the current typed contracts until credentials exist.
3. Decide whether Google Docs/Sheets should use a connector-first flow or app-owned OAuth credentials for the first real integration.
