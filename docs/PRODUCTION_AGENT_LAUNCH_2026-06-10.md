# Production Agent Launch - 2026-06-10

Status: historical launch note

This note records the first production-gap multi-agent launch.

## Source Of Truth

- Runbook: `docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md`
- Project board target: `docs/PRODUCTION_EXECUTION_BOARD.md`

## First Wave

| Agent | Runtime Nickname | Agent ID | Scope | Status |
| --- | --- | --- | --- | --- |
| Project Manager Agent | Singer | `019eb31b-002b-7a33-b4e5-bf79f5dbb696` | Production execution board, dependencies, risks, acceptance criteria | Complete |
| Foundation Agent | Lovelace | `019eb31b-2fe8-7ad3-9682-e5bac1f50de7` | Runtime/config/env baseline | Complete |
| Persistence And Governance Agent | Hilbert | `019eb31b-753c-7bb3-bb0a-1986d37988d1` | Durable workflow contracts, DB/auth/audit scaffolding | Complete |
| AI Routes Agent | Galileo | `019eb31b-da6e-7970-b0a0-c0bbd2ad8348` | Agent output contracts and live AI route scaffolding plan/code | Complete |

## First Wave Output

- Project Manager created `docs/PRODUCTION_EXECUTION_BOARD.md`.
- Foundation expanded `.env.example` and added `docs/PRODUCTION_RUNTIME_BASELINE.md`.
- Persistence And Governance added typed DB/auth/audit scaffolding in `lib/db/*`, `lib/auth/*`, and `lib/audit/*`, plus `docs/PERSISTENCE_GOVERNANCE_PLAN.md`.
- AI Routes added provider-neutral agent contracts, schemas, request helpers, fallbacks, and implementation notes in `lib/agents/*` and `docs/AI_ROUTES_IMPLEMENTATION_PLAN.md`.
- Coordinator added exact match label display via `formatMatchScoreLabel`, so visible labels can render as `Strong Match (87%)` without changing deterministic score categories.

## Coordinator Defaults For Next Wave

- Repository control: this workspace is still not a Git repository. Continue with strict file ownership and serialize high-conflict files until the user decides whether to initialize Git.
- Persistence stack: use Supabase/Postgres-compatible contracts as the default, with direct SQL/schema contracts before choosing Drizzle or Prisma.
- AI route approach: use the provider-neutral request/schema layer first, with OpenAI direct API compatibility as the first live provider path.
- Google Docs/Sheets approach: build adapters against the shared import review contract and provide clear fallback behavior when credentials or connectors are unavailable.

## Coordinator Notes

- Project Manager Agent was added to the production runbook and reusable briefs before launch.
- The first wave intentionally avoids UI, parser, and roster files until the execution board and contract scaffolds are established.
- Expected next wave: Document Intake, Google Workspace, Roster And Assignment, Settings And UI Wiring, then Verification.

## Open Coordinator Decisions

- Confirm persistence implementation stack: Supabase SQL directly, Drizzle, Prisma, or another adapter.
- Confirm AI implementation surface: OpenAI API directly, Vercel AI SDK, or a thin internal provider interface first.
- Confirm Google Docs/Sheets access path: Google Drive connector, OAuth app credentials, service account, or staged stub until credentials are available.

## Verification So Far

- Bundled Node TypeScript check passed.
- Bundled Node ESLint passed with 5 existing `@next/next/no-img-element` warnings.
- Production build is known to require escalation in this Codex shell because sandboxed Next worker spawning can hit `spawn EPERM`.

## Second Wave

| Agent | Runtime Nickname | Agent ID | Scope | Status |
| --- | --- | --- | --- | --- |
| Document Intake Agent | Noether | `019eb426-d7cd-7ca0-84bb-947424dbff64` | Local CSV, Excel, PDF, Word intake adapters | Complete |
| Google Workspace Agent | Hooke | `019eb427-0ab9-75c0-b50d-c7cac5f4d459` | Google Docs/Sheets intake adapters and fallback plan | Complete |
| Roster And Assignment Agent | Wegener | `019eb427-e44b-71d1-9d6a-a5b6fd3c47db` | Roster import and assignment review helpers | Running |
| Settings And UI Wiring Agent | Ramanujan | `019eb428-2a5a-70f1-94cc-6dd390b0a41d` | App-level settings wiring and visible behavior | Complete |

## Second Wave Output So Far

- Document Intake added `lib/imports/*` local intake adapters and `docs/DOCUMENT_INTAKE_PLAN.md`. CSV reuses existing behavior; Excel/PDF/Word return clear fallback review records until parser dependencies are added.
- Google Workspace added `lib/google-workspace/*` adapters and `docs/GOOGLE_WORKSPACE_INTAKE_PLAN.md`. Docs/Sheets can map connector-provided content into review records and return credential/fallback states.
- Settings And UI Wiring connected client-side settings state across `app/page.tsx`, `SettingsView`, `MatchingView`, and `ImportView`; confidence threshold and default priority now influence visible app behavior.
- Coordinator patched `lib/agents/schemas.ts` from recursive type alias to interface after TypeScript surfaced a scaffold typing issue.
