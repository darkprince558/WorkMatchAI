# WorkMatch Demo Agentic Execution Board

Status: historical demo coordination board. Do not use as the active execution board for current work.
Target demo date: Wednesday, June 10, 2026.

This board coordinates the active multi-agent pass for making WorkMatch AI demo-ready. The goal is a credible manager approval demo, not a production release.

For the next production-completion pass covering document parsing, live AI routes, persistence, roster import, exact match labels, and settings wiring, use `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`.

## Demo Freeze Criteria

The demo is ready when:

- The app loads locally or from a Vercel preview.
- Sidebar navigation works for Dashboard, Employees, Tasks & Projects, AI Matching, and Imports / Review.
- Dashboard metrics, charts, and insight cards render from realistic sample data.
- Employee search, filters, and profile details work.
- Task board status movement and task details work.
- Matching shows task-first and employee-first recommendations with labels like `Strong Match (87%)`.
- Team/project buckets show plausible multi-person staffing for at least one team project.
- Manager approval of a match updates assignment state.
- CSV import works for `sample-data/employees.csv` and `sample-data/tasks.csv`.
- Import review allows confirm, correct, remove, and commit before data enters the demo state.
- `npm run verify` passes, or the documented bundled-Node workaround passes lint, typecheck, and build.

## Active Agent Roster

| Agent | Owner | Primary Scope | Success Signal |
| --- | --- | --- | --- |
| Coordinator | Integration and acceptance | This board, final smoke test, handoffs | Demo path verified end to end |
| Foundation Agent | Setup and app shell | Config, scripts, layout, header, sidebar | Build/check commands are reliable |
| Data And Matching Agent | Deterministic matching and sample data | `lib/types.ts`, `lib/workmatch.ts`, `lib/mock-data.ts`, `sample-data/*` | Scores, labels, weights, and team logic match the plan |
| Demo UI Agent | Manager-facing screens | `DashboardView`, `EmployeesView`, `TasksView`, `MatchingView` | Required screens are clear and demo-safe |
| Import And Review Agent | CSV intake and review | `ImportView`, import helpers if needed | Sample CSVs can be reviewed and committed |
| Agentic Workflow Agent | Future AI implementation contracts | `docs/*` workflow contracts | AI boundaries and review checkpoints are explainable |
| Verification Agent | Acceptance checks | Verify command and browser smoke test | Failures are reported with exact flows |

## Priority Queue

### P0 - Must Finish

- Confirm local verification path.
- Confirm dashboard, employees, tasks, matching, and imports are navigable.
- Confirm deterministic scoring uses the planned label thresholds.
- Confirm CSV import/review/commit works for both sample CSV files.
- Confirm at least one team-based project bucket is present.

### P1 - Should Finish

- Make manager priority choices visibly affect rankings.
- Make task and employee details complete enough for a manager walkthrough.
- Make duplicate and missing-field import warnings specific.
- Record a concise smoke-test result.

### P2 - Defer Unless Cheap

- Automated parser/scoring tests.
- Production persistence, auth, audit logs, Supabase, and storage.
- Live OpenAI routes or real document AI extraction.
- Excel, PDF, Word, Google Docs, and Google Sheets parsing.

## Handoff Format

Each agent should finish with:

```text
Status: complete | partial | blocked
Files changed:
- path/to/file

What changed:
- Short summary

Verification:
- Command or browser check run

Risks / follow-up:
- Anything the coordinator should know
```

## Coordinator Notes

- Keep matching percentages deterministic.
- AI-style text may explain scores, but must not change them.
- Manager review is required before imports and assignments are treated as final.
- Avoid broad refactors before the demo freeze.
- If agents touch overlapping files, preserve the demo path first and reconcile manually.

## June 9, 2026 Agent Pass Result

Status: demo implementation pass complete.

Completed agent outputs:

- Data And Matching: aligned deterministic labels and thresholds, normalized weighted scoring, priority-sensitive ranking, complementary team matching, 10 demo employees, and 8 demo tasks.
- Demo UI: improved dashboard, employees, tasks, and matching screens; added visible priority controls, richer details, status controls, labels like `Strong Match (87%)`, and editable team buckets.
- Import And Review: improved CSV review, blocking vs reviewable issues, existing-record warnings, sample task `team_size`, and required-skill min rating / priority display.
- Agentic Workflow: clarified future AI boundaries and review checkpoints in docs without adding live AI routes.
- Verification: browser-smoke-tested Dashboard, Employees, Tasks, Matching, and Imports render path on `http://127.0.0.1:3002`; sample CSV parser returned 10 employees and 8 tasks, including 4 team tasks.
- Foundation: interrupted with no changes; no long-running process left by that agent.

Final verification:

- `npm` is not available on PATH in this Codex shell, so `npm run verify` could not be invoked directly.
- Bundled Node workaround passed:
  - `tsc --noEmit`
  - `eslint .` with 5 `@next/next/no-img-element` warnings and 0 errors
  - `next build` after stopping local dev servers that were sharing `.next`

Known non-blocking warnings:

- ESLint warns about plain `<img>` usage in `Header`, `EmployeesView`, `MatchingView`, and `TasksView`.
- Production build emits Recharts prerender warnings about chart container width/height. Runtime smoke testing passed after a clean dev-server restart.

## Next Production Gap Pass

The following work is intentionally outside the demo freeze and is assigned in `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`:

- Excel, PDF, Word, Google Docs, and Google Sheets parsing.
- Live model-backed AI routes and agent run records.
- Persistence, auth, permissions, audit logs, and database-backed workflows.
- Project roster import.
- Exact label wording such as `Strong Match (87%)`.
- Settings controls wired into scoring, import review, governance, and persistence.

