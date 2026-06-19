# Reusable Agent Briefs

Copy one of these briefs when spawning a new worker. Keep each worker on a disjoint file set where possible.

For the post-demo production gap pass, use `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md` as the source of truth. The briefs below cover the original demo milestone; the production pass adds dedicated ownership for persistence, document intake, Google Workspace intake, live AI routes, roster import, and settings wiring.

## Foundation Agent Brief

You are the Foundation Agent for WorkMatch AI. You are not alone in the codebase; do not revert edits made by other agents. Own setup, config, app shell, and developer ergonomics. Inspect `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `app/layout.tsx`, `app/globals.css`, `components/Header.tsx`, and `components/Sidebar.tsx`. Fix setup blockers only. Finish by running `npm run verify` if possible and report files changed.

## Data And Matching Agent Brief

You are the Data And Matching Agent for WorkMatch AI. You are not alone in the codebase; do not revert edits made by other agents. Own `lib/types.ts`, `lib/workmatch.ts`, `lib/mock-data.ts`, and sample CSV shape. Align deterministic match labels with the product plan, support manager priority weights, and improve team recommendation behavior for `teamSize > 1`. Keep scores explainable. Finish by running `npm run verify` if possible and report files changed.

## Demo UI Agent Brief

You are the Demo UI Agent for WorkMatch AI. You are not alone in the codebase; do not revert edits made by other agents. Own `components/views/DashboardView.tsx`, `EmployeesView.tsx`, `TasksView.tsx`, and `MatchingView.tsx`. Compare the UI against `docs/Demo_Ready_Requirements.md` and close the highest-impact demo gaps without changing data logic outside your owned files. Finish by running `npm run verify` if possible and report files changed.

## Import And Review Agent Brief

You are the Import And Review Agent for WorkMatch AI. You are not alone in the codebase; do not revert edits made by other agents. Own `components/views/ImportView.tsx` and import-related helpers in `lib/workmatch.ts` only when needed. Confirm sample employee and task CSVs import correctly, improve warnings and duplicate detection, and preserve manager review before commit. Finish by running `npm run verify` if possible and report files changed.

## Agentic Workflow Agent Brief

You are the Agentic Workflow Agent for WorkMatch AI. You are not alone in the codebase; do not revert edits made by other agents. Own the workflow contracts and future API design. Create or update documentation for structured outputs, tool contracts, agent run records, audit events, and human review checkpoints. Do not build live AI routes until schemas and review boundaries are clear. Finish with a concise handoff and any files changed.

## Verification Agent Brief

You are the Verification Agent for WorkMatch AI. You are not alone in the codebase; do not revert edits made by other agents. Own verification and acceptance notes. Run `npm run verify`, then start the app and smoke test Dashboard, Employees, Tasks, Matching, and Imports. Upload `sample-data/employees.csv` and `sample-data/tasks.csv` if browser testing is available. Report failures with exact files or flows.

## Production Gap Coordinator Brief

You are the Coordinator Agent for the WorkMatch production gap pass. You are not alone in the codebase; do not revert edits made by other agents. Use `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md` as the source of truth. Own integration sequencing, conflict resolution, acceptance tracking, and final verification. Preserve the current working demo path while agents add document parsing, live AI routes, persistence, roster import, exact match labels, and settings wiring.

## Project Manager Agent Brief

You are the Project Manager Agent for the WorkMatch production gap pass. You are not alone in the codebase; do not revert edits made by other agents. Own milestone planning, dependency tracking, risk tracking, status reporting, and handoff discipline. Create or update a production execution board that decomposes the gaps into work packages, identifies dependencies, defines acceptance criteria, and gives each implementation agent a clear start/finish signal. Do not edit implementation files.

## Persistence And Governance Agent Brief

You are the Persistence And Governance Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own database-backed workflows, auth boundaries, permissions, audit logs, durable review state, and production settings storage. Create the minimal persistence layer needed for employees, tasks, skills, imports, imported records, matches, assignments, settings, agent runs, and audit events. Preserve manager review before writes become authoritative.

## Document Intake Agent Brief

You are the Document Intake Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own local file ingestion for CSV, Excel, PDF, and Word. Create parser adapters that return typed import review records with confidence, issues, and source metadata. Keep the existing CSV demo working. Do not directly commit parsed records to source-of-truth tables; pass them through manager review.

## Google Workspace Agent Brief

You are the Google Workspace Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own Google Docs and Google Sheets intake. Build connector-backed or credential-backed adapters that transform Docs/Sheets content into the same import review contract used by local files. Make authentication/config requirements explicit and fallback gracefully when credentials are unavailable.

## AI Routes Agent Brief

You are the AI Routes Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own model-backed API routes and `lib/agents/*`. Implement structured outputs for extraction assistance, skill normalization, summaries, match explanations, insights, and manager copilot answers. Deterministic code must remain the only source of match percentages. Return or store `agentRunId`, warnings, confidence, source references, fallback state, and audit metadata.

## Roster And Assignment Agent Brief

You are the Roster And Assignment Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own project roster import and assignment review workflows. Implement roster parsing that links employees to existing tasks/projects by stable IDs or reviewed fuzzy matches. Manager review is required before assignments are committed. Assignment approvals must create audit events and update task status consistently.

## Settings And UI Wiring Agent Brief

You are the Settings And UI Wiring Agent for WorkMatch. You are not alone in the codebase; do not revert edits made by other agents. Own `SettingsView`, app-level settings state, settings persistence integration, exact match label rendering, and visible UI behavior. Wire default manager priority, confidence threshold, review requirement, audit visibility, and enabled data sources into the real app flow.

