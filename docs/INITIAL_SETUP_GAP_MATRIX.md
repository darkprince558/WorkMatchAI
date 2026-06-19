# Initial Setup Gap Matrix

This matrix combines the first parallel sub-agent audits. Use it to assign the next implementation pass.

This file reflects the initial demo-readiness pass. For the post-demo production gaps covering expanded document parsing, live AI routes, persistence, roster import, exact match labels, and settings wiring, use `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`.

## P0 Setup Blockers

| Gap | Owner | Files / Area | Done When |
| --- | --- | --- | --- |
| `npm` is not available on PATH in this Codex shell; local `.cmd` launchers can fail with `Access is denied` | Foundation | local environment | `node --version`, `npm --version`, `npm ci`, and `npm run verify` work in a normal Node.js/npm shell |
| Baseline verification uses a Codex workaround | Foundation + Verification | project scripts | Keep direct bundled-Node commands documented until npm is available on PATH |

## P1 Demo Completion Gaps

| Gap | Owner | Files / Area | Done When |
| --- | --- | --- | --- |
| README was template-based | Coordinator | `README.md` | README explains WorkMatch setup, demo data, verification, and agent runbook |
| Match labels do not match architecture thresholds | Data And Matching | `lib/types.ts`, `lib/workmatch.ts` | Labels include Perfect, Strong, Good, Growth, Risky, and Not Recommended |
| Manager priority weighting is not implemented | Data And Matching + Demo UI | `lib/workmatch.ts`, `components/views/MatchingView.tsx` | Priority choices visibly affect ranking and explanations |
| Team project bucket is static top-N matching | Data And Matching + Demo UI | `lib/workmatch.ts`, `MatchingView.tsx` | Team recommendations cover complementary required skills |
| Imported team tasks default to `teamSize: 2` | Import And Review | `lib/workmatch.ts`, `sample-data/tasks.csv` | Imported team size matches source data or an explicit default rule |
| CSV required skill ratings/priorities are discarded | Import And Review + Data And Matching | `lib/types.ts`, `lib/workmatch.ts` | Required skill level and importance survive parsing |
| Import review allows remove/commit only | Import And Review | `components/views/ImportView.tsx` | Manager can confirm or correct records before commit |
| Duplicate and missing-field review is shallow | Import And Review | `ImportView.tsx`, `lib/workmatch.ts` | Duplicates and missing fields show clear review warnings |
| Task detail drawer misses required demo fields | Demo UI | `components/views/TasksView.tsx` | Optional skills, urgency, hours, location, and staffing mode are visible |
| Several visible controls are inert | Demo UI | Header, Tasks, Matching, Employees | Demo-facing controls either work or are removed from the demo path |

## P2 Hardening Gaps

| Gap | Owner | Files / Area | Done When |
| --- | --- | --- | --- |
| `next.config.ts` ignores ESLint during builds | Foundation + Verification | `next.config.ts` | Track for now; after `npm run lint` has a clean baseline, either document why `eslint.ignoreDuringBuilds` remains intentional or restore build-time lint enforcement |
| Mock data and CSV data can drift | Data And Matching | `lib/mock-data.ts`, `sample-data/*` | Seed/mock generation has one source of truth or a parity check |
| No automated parser/scoring tests | Verification | future tests | CSV parsing and scoring fixtures are covered |
| No browser smoke-test notes | Verification | docs or tests | Dashboard, Employees, Tasks, Matching, and Imports are verified |
| AI workflow schemas are not formalized | Agentic Workflow | docs, future `lib/agents/*` | Structured output contracts and review checkpoints are documented |

## Recommended First Parallel Pass

1. Foundation fixes package-manager/build baseline.
2. Data And Matching updates deterministic labels, thresholds, and priority weighting.
3. Import And Review improves CSV review, duplicate detection, and team-size parsing.
4. Demo UI wires priority controls and closes obvious inert demo controls.
5. Verification reruns `npm run verify` and records a smoke-test result.
