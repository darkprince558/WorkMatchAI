# WorkMatch AI

WorkMatch AI is a portfolio-grade Next.js project for workforce matching, staffing recommendations, skill-gap visibility, import review, and manager-approved staffing decisions.

The goal is to demonstrate production-minded AI SaaS architecture without taking on unnecessary operating cost. The app is built as a resume project first, with a clear path toward enterprise readiness through multi-tenant data boundaries, structured AI agent outputs, auditability, RAG-ready document workflows, and future integrations with tools like Google Sheets, Notion, ClickUp, Jira, and Microsoft 365.

The current implementation runs with local in-memory fallback data when provider accounts are not configured. When Supabase is configured, employees, tasks, assignments, imports, settings, audit events, agent runs, and monitoring events persist through server-side API routes.

## Run Locally

Prerequisite: Node.js with `npm` available on PATH.

```powershell
npm ci
npm run dev
```

Then open the local URL printed by Next.js, usually `http://localhost:3000`.

Use `npm install` instead when intentionally adding or updating dependencies.

## Verify

Use the shared verification command before handing work back:

```powershell
npm run verify
```

This runs lint, TypeScript checking, and a production build.

## Demo Data

Sample CSV files are available for the import flow:

- `sample-data/employees.csv`
- `sample-data/tasks.csv`

The app also starts with equivalent mock data in `lib/mock-data.ts` so the dashboard is populated immediately.

## Multi-Agent Setup

The active demo execution board is [docs/DEMO_AGENTIC_EXECUTION_BOARD.md](docs/DEMO_AGENTIC_EXECUTION_BOARD.md).

Use [docs/MULTI_AGENT_INITIAL_SETUP.md](docs/MULTI_AGENT_INITIAL_SETUP.md) as the command-center runbook for finishing the initial demo setup with parallel agents.

Use [docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md](docs/PRODUCTION_GAP_MULTI_AGENT_SETUP.md) for the next multi-agent pass that finishes document parsing, live AI routes, persistence, roster import, exact match labels, and settings wiring.

Reusable worker prompts are in [docs/AGENT_BRIEFS.md](docs/AGENT_BRIEFS.md).

The prioritized setup gap matrix is in [docs/INITIAL_SETUP_GAP_MATRIX.md](docs/INITIAL_SETUP_GAP_MATRIX.md).

The current product readiness audit and execution plan is in [docs/PRODUCT_READINESS_AUDIT_2026-06-19.md](docs/PRODUCT_READINESS_AUDIT_2026-06-19.md).

## Current Notes

- CSV, Excel `.xlsx`, Word `.docx`, and selectable-text PDF import are implemented.
- Google Workspace intake is disabled. The future cloud-document path should be Microsoft 365 / Microsoft Graph.
- Matching scores are deterministic in `lib/workmatch.ts`.
- AI routes use the selected provider switch: `AI_PROVIDER=gemini` for the demo-friendly Gemini path, or `AI_PROVIDER=openai` for GPT/OpenAI. Settings can override the provider per organization without exposing API keys.
- Production monitoring tracks estimated AI cost, fallback rate, parser failures, and route errors.
- Enterprise SaaS plans are documented for credibility, but costs should stay portfolio-sized until real user validation.
- This folder is now initialized as a Git repository.
- This shell does not have `npm` available on PATH, and the local `.cmd` launchers can fail with `Access is denied`. Verification can still be run in this Codex environment by invoking the bundled Node executable directly against each tool entrypoint.

Normal machine workflow:

```powershell
cd C:\Users\anish.jami\Desktop\receipt-proj\WorkMatch
node --version
npm --version
npm ci
npm run verify
```

Use `npm run dev` after `npm run verify` passes if you need a browser smoke test.

Demo AI provider switch:

```powershell
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"
```

Codex shell workaround used during this setup pass:

```powershell
C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\typescript\bin\tsc --noEmit
C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\eslint\bin\eslint.js .
C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\next\dist\bin\next build
```

