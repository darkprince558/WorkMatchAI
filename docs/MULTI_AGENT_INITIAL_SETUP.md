# WorkMatch Multi-Agent Initial Setup

This runbook turns the existing WorkMatch AI plan into an executable multi-agent setup for finishing the first demo-ready milestone.

For the active June 10, 2026 demo pass, use `docs/DEMO_AGENTIC_EXECUTION_BOARD.md` as the live execution board.

## Current Project State

- The workspace is a Next.js, React, TypeScript, and Tailwind app.
- The app already has the main demo navigation: Dashboard, Employees, Tasks & Projects, AI Matching, and Imports / Review.
- Sample data exists in `sample-data/employees.csv` and `sample-data/tasks.csv`.
- The deterministic matching engine lives in `lib/workmatch.ts`.
- The browser-side demo state is coordinated in `app/page.tsx`.
- This folder is not currently initialized as a Git repository. Initialize Git before parallel edits if you want clean branching, diffs, and rollback.
- In this shell, `npm` is not currently available on PATH and the local `.cmd` launchers can fail with `Access is denied`. Use a normal Node.js/npm terminal for day-to-day work, or invoke the bundled Node executable directly against tool entrypoints for Codex verification.

## Shared Finish Line

Every implementation agent should finish with:

```powershell
npm run verify
```

That script runs lint, TypeScript checking, and a production build.

If this shell still cannot run Node/npm, use a machine or terminal with Node.js/npm available and run:

```powershell
cd C:\Users\anish.jami\Desktop\receipt-proj\WorkMatch
node --version
npm --version
npm ci
npm run verify
```

Codex shell workaround:

```powershell
C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\typescript\bin\tsc --noEmit
C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\eslint\bin\eslint.js .
C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\next\dist\bin\next build
```

For UI work, also run the app and smoke test the changed flow:

```powershell
npm run dev
```

## Operating Rules

- Keep ownership boundaries strict. Each agent owns specific files or modules.
- Do not revert edits made by another agent.
- Keep the demo milestone focused. Avoid production-only work unless it unblocks the demo.
- Matching scores must stay deterministic in code; AI text should explain, not secretly change, the score.
- Manager review is required before imports or assignments are treated as final.
- Prefer small, reviewable patches with a short handoff note.

## Agent Roster

### 1. Coordinator Agent

Owner: integration, sequencing, final acceptance, and conflict resolution.

Primary files:

- `README.md`
- `docs/MULTI_AGENT_INITIAL_SETUP.md`
- `docs/Demo_Ready_Requirements.md`
- `package.json`

First tasks:

- Initialize Git if desired.
- Confirm dependencies install cleanly.
- Keep the task board current.
- Merge or reconcile worker outputs.
- Run final `npm run verify`.
- Start the local dev server and complete a dashboard-to-import smoke test.

### 2. Foundation Agent

Owner: project setup, app shell, configuration, and developer ergonomics.

Primary files:

- `package.json`
- `next.config.ts`
- `tsconfig.json`
- `eslint.config.mjs`
- `app/layout.tsx`
- `app/globals.css`
- `components/Header.tsx`
- `components/Sidebar.tsx`

First tasks:

- Verify the Next.js config builds locally.
- Confirm no script points to a missing command.
- Make sidebar/header behavior reliable on desktop and mobile.
- Confirm environment variable docs match `.env.example`.
- Add any missing setup notes to `README.md`.

### 3. Data And Matching Agent

Owner: data contracts, mock data, scoring, labels, and team recommendation logic.

Primary files:

- `lib/types.ts`
- `lib/workmatch.ts`
- `lib/mock-data.ts`
- `sample-data/employees.csv`
- `sample-data/tasks.csv`

First tasks:

- Align match labels with the product plan: Perfect, Strong, Good, Growth, Risky, Not Recommended.
- Add explicit scoring weights for skill fit, availability, experience, location, urgency, and growth.
- Support manager-selected priority weights without breaking deterministic scoring.
- Improve team recommendations for tasks with `teamSize > 1`.
- Keep sample data at 8-12 employees and 6-10 tasks with at least one scarce skill gap.

### 4. Demo UI Agent

Owner: visible manager-facing screens and demo completeness.

Primary files:

- `components/views/DashboardView.tsx`
- `components/views/EmployeesView.tsx`
- `components/views/TasksView.tsx`
- `components/views/MatchingView.tsx`

First tasks:

- Compare every screen to `docs/Demo_Ready_Requirements.md`.
- Make dashboard KPIs, charts, and insight panels easy to scan.
- Make employee and task details inspectable without leaving the current view.
- Improve matching priority controls and task-first/employee-first clarity.
- Represent project buckets convincingly, even before full drag-and-drop is implemented.

### 5. Import And Review Agent

Owner: CSV import, review, validation, and manager approval.

Primary files:

- `components/views/ImportView.tsx`
- `lib/workmatch.ts`
- `lib/types.ts`
- `sample-data/employees.csv`
- `sample-data/tasks.csv`

First tasks:

- Confirm both sample CSV files import correctly.
- Add duplicate detection for incoming employees and tasks.
- Make missing field warnings more specific.
- Allow basic inline correction before commit if time permits.
- Keep Excel, PDF, Word, Google Docs, and Google Sheets visible as planned capabilities only.

### 6. Agentic Workflow Agent

Owner: AI workflow contracts, structured outputs, review checkpoints, and future API boundaries.

Primary files:

- `docs/Technical_Architecture_and_Agentic_Plan.md`
- `docs/WorkMatch_AI_Product_Plan.md`
- future `app/api/*` route handlers
- future `lib/agents/*`

First tasks:

- Define structured output schemas for document intake, skill normalization, matching explanations, workforce insights, and manager copilot responses.
- Design the `agent_runs` and `audit_events` records needed for traceability.
- Define tool contracts for CSV parsing, skill lookup, match scoring, and review submission.
- Keep AI outputs separate from deterministic scoring.
- Add prompts only after the schemas and review checkpoints are clear.

### 7. Verification Agent

Owner: acceptance checks and regression detection.

Primary files:

- `docs/Demo_Ready_Requirements.md`
- future test files
- future browser smoke-test notes

First tasks:

- Run `npm run verify`.
- Start `npm run dev` and smoke test Dashboard, Employees, Tasks, Matching, and Imports.
- Upload `sample-data/employees.csv` and `sample-data/tasks.csv`.
- Confirm approving a match updates the task assignment state.
- Record any visual or functional gaps with file-level references.

## Handoff Format

Each agent should finish with:

```text
Status: complete | blocked | partial
Files changed:
- path/to/file

What changed:
- Short summary

Verification:
- Command or browser check run

Risks / follow-up:
- Anything the coordinator should know
```

## Initial Sprint Board

| Priority | Work Item | Owner | Acceptance Signal |
| --- | --- | --- | --- |
| P0 | Expose npm or another approved package manager for normal local development | Foundation | `npm --version` works in the user's terminal |
| P0 | Confirm project installs and builds | Foundation | `npm ci` and `npm run verify` pass in a normal terminal; Codex can use the explicit bundled Node workaround |
| P0 | Align demo checklist to current implementation | Coordinator + Verification | Gap list exists with owners |
| P0 | Improve deterministic match labels and weighting | Data And Matching | Labels match product plan |
| P0 | Verify CSV import for both sample files | Import And Review | Records can be reviewed and committed |
| P1 | Improve project bucket/team recommendations | Data And Matching + Demo UI | Team task shows plausible staffed bucket |
| P1 | Add priority selector behavior | Demo UI + Data And Matching | Manager choices affect ranking visibly |
| P1 | Create structured AI workflow contracts | Agentic Workflow | Schemas and review checkpoints are documented |
| P2 | Add automated tests for parsing/scoring | Verification | Parser and scoring tests cover sample data |
| P2 | Decide whether to restore Next.js build-time lint enforcement | Foundation + Verification | Keep `eslint.ignoreDuringBuilds` only if intentional after a clean `npm run lint` baseline, otherwise restore build-time enforcement |

## Suggested Parallel Kickoff

Use this order for the first multi-agent pass:

1. Foundation Agent verifies install/build and fixes setup blockers.
2. Data And Matching Agent tightens scoring and match labels.
3. Demo UI Agent closes visible demo gaps.
4. Import And Review Agent validates CSV intake.
5. Agentic Workflow Agent writes schemas and future API contracts.
6. Verification Agent runs the full acceptance path after the others finish.

The coordinator should keep working on integration while agents run, then only wait when a result is needed for the next blocking step.

