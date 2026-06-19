# WorkMatch Production Runtime Baseline

Status: foundation baseline for the production gap pass
Owner: Foundation Agent
Last updated: 2026-06-10

This document records the runtime, environment, and verification baseline for production-gap agents. It is intentionally limited to setup/config surface area and does not change product behavior.

## Current Runtime Findings

- `package.json` defines the expected scripts:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run verify`, which runs lint, typecheck, then build.
- `next.config.ts` enables React strict mode, blocks TypeScript build errors, skips ESLint during `next build`, allows remote images from `picsum.photos`, transpiles `motion`, and reads `DISABLE_HMR` only in dev mode.
- `tsconfig.json` is strict, uses `moduleResolution: "bundler"`, and maps `@/*` to the workspace root.
- Source env usage now covers app runtime, Supabase/Auth, AI provider selection, monitoring cost rates, and optional Microsoft 365 setup.
- `README.md` and setup docs already prefer normal `npm` verification while documenting a bundled-Node workaround for this Codex shell.
- This folder is initialized as a Git repository.

## Environment Variables

Copy `.env.example` to `.env.local` for local development. Never commit real secrets.

### Required For Current Local Demo

The current demo can run without production service credentials. Keep these values present for consistent local URLs and Codex behavior:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | Yes | Public app display name. |
| `APP_URL` | Yes | Canonical local or deployed app URL for redirects, callbacks, and generated links. |
| `DISABLE_HMR` | Optional | Set to `true` only for AI Studio/Codex dev sessions that must disable file watching. |

### Required Before Production Features Are Enabled

These variables are required by the production gap pass before the owning agents can enable their live routes or persistence paths:

| Variable | Owner | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Persistence And Governance | Server-side Postgres connection for ORM, migrations, and API routes. |
| `NEXT_PUBLIC_SUPABASE_URL` | Persistence And Governance | Public Supabase project URL if Supabase is confirmed. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Persistence And Governance | Browser-safe Supabase anon key if Supabase client access is used. |
| `SUPABASE_SERVICE_ROLE_KEY` | Persistence And Governance | Server-only key for trusted writes, migrations, audit events, and admin workflows. |
| `SUPABASE_STORAGE_BUCKET` | Document Intake / Persistence | Upload bucket for source documents and extracted artifacts. |
| `AUTH_SECRET` | Persistence And Governance | Server-only secret for signing sessions or auth framework tokens. |
| `AI_PROVIDER` | AI Routes | Default provider switch, `gemini` or `openai`. |
| `GEMINI_API_KEY` | AI Routes | Server-only Gemini key for demo-friendly model-backed routes. |
| `GEMINI_MODEL` | AI Routes | Chosen Gemini model name. |
| `GEMINI_INPUT_COST_PER_1M_TOKENS` | Monitoring | Optional Gemini input-token cost rate. |
| `GEMINI_OUTPUT_COST_PER_1M_TOKENS` | Monitoring | Optional Gemini output-token cost rate. |
| `OPENAI_API_KEY` | AI Routes | Server-only OpenAI key for GPT/model-backed routes. |
| `OPENAI_MODEL` | AI Routes | Chosen OpenAI model name. |
| `OPENAI_INPUT_COST_PER_1M_TOKENS` | Monitoring | Optional OpenAI input-token cost rate. |
| `OPENAI_OUTPUT_COST_PER_1M_TOKENS` | Monitoring | Optional OpenAI output-token cost rate. |
| `MICROSOFT_CLIENT_ID` | Microsoft 365 | Future OAuth client ID for OneDrive/SharePoint intake. |
| `MICROSOFT_CLIENT_SECRET` | Microsoft 365 | Future server-only OAuth client secret. |
| `MICROSOFT_TENANT_ID` | Microsoft 365 | Future tenant identifier. |
| `MICROSOFT_REDIRECT_URI` | Microsoft 365 | Future OAuth callback URL. |
| `MICROSOFT_GRAPH_SCOPES` | Microsoft 365 | Future Microsoft Graph scopes. |

## Normal Verification Commands

Use this path in a normal developer terminal with Node.js and npm available:

```powershell
cd C:\Users\anish.jami\Desktop\receipt-proj\WorkMatch
node --version
npm --version
npm ci
npm run verify
```

For browser smoke testing after `npm run verify` passes:

```powershell
npm run dev
```

Then open the local URL printed by Next.js, usually `http://localhost:3000`.

## Codex Verification Commands

In this Codex shell, `npm` may not be available on `PATH`, and Windows `.cmd` launchers can fail with `Access is denied`. Preserve the normal `npm run verify` path for developers, but use the bundled Node executable here when needed:

```powershell
$node = "C:\Users\anish.jami\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $node .\node_modules\eslint\bin\eslint.js .
& $node .\node_modules\typescript\bin\tsc --noEmit
& $node .\node_modules\next\dist\bin\next build
```

This mirrors `npm run verify` as closely as this shell allows: lint, typecheck, then production build.

Known Codex caveat: sandboxed `next build` can compile successfully and then fail with Windows `spawn EPERM`. Rerun the same bundled-Node build command with approval/escalation before treating it as a product build failure. On 2026-06-10, the escalated build passed and reported two existing Recharts prerender warnings about chart containers measuring `-1` width/height.

## Agent Notes

- Foundation owns this baseline, `.env.example`, and setup-command documentation.
- Project Manager owns `docs/PRODUCTION_EXECUTION_BOARD.md`; do not edit that board from this scope.
- Persistence, AI Routes, Microsoft 365, and Document Intake agents should update this document only if they add or rename required runtime variables.
- Feature agents should keep fallback behavior explicit when any required production credential is missing.
