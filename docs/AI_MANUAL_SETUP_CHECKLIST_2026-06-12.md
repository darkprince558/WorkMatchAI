# WorkMatch AI Manual Setup Checklist

Date: 2026-06-12

Purpose: this is the manual setup list for making the AI, auth, import, and deployment parts of WorkMatch work with real provider accounts instead of local fallbacks.

## Current Code Status

Already implemented in this repo:

- Server-side AI routes under `POST /api/agents/{agentName}`.
- Provider switch for Gemini or OpenAI/GPT model-backed routes.
- OpenAI Responses API integration using server-side `fetch`.
- Gemini Generate Content integration using the official `@google/genai` SDK.
- Deterministic fallbacks when the selected provider is not configured or fails validation.
- Agent run logging with in-memory fallback and optional Supabase REST persistence.
- Supabase Auth sign-in, sign-up, sign-out, session refresh, and HttpOnly cookies.
- Middleware that protects the app and non-auth API routes.
- Local import parsers for CSV, `.xlsx`, `.docx`, and text-based PDFs.
- Google Workspace intake disabled with a 410 compatibility route.
- Microsoft 365 is the planned future cloud-document connector path.
- Supabase-backed data route for employees, tasks, assignments, imports, and settings with in-memory fallback.
- Production monitoring routes for AI cost estimate, fallback rate, parser warnings/failures, and route errors.
- `.env.example` with the runtime variables the app expects.
- Production starter Supabase SQL in `supabase/schema.sql`, including business tables and organization-scoped RLS.
- Git repository initialized in the project folder.

Not manually completed yet:

- Real AI provider API key and budget setup.
- Real Supabase project/API keys/Auth settings/schema execution.
- Vercel project deployment and production environment variables.
- Production domain/callback URL updates.
- Production smoke testing in a normal terminal/deployment environment.

## Must-Do Manual Setup

### 1. AI Provider

Choose the live provider for model-backed AI routes. For a low-cost demo, set Gemini as the selected provider. For production GPT/OpenAI usage, set OpenAI.

Set the provider switch:

```text
AI_PROVIDER=gemini
```

The Settings screen can also override the provider per organization with `Env`, `Gemini`, or `OpenAI`. `Env` follows `AI_PROVIDER`.

#### Gemini Demo Path

Do manually:

- Create or choose a Gemini API key in Google AI Studio.
- Save the key in a password manager.
- Review the current Gemini free-tier and data-use terms before using anything beyond mock/demo data.

Set these env vars:

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_INPUT_COST_PER_1M_TOKENS=
GEMINI_OUTPUT_COST_PER_1M_TOKENS=
```

#### OpenAI/GPT Path

Do manually:

- Create a dedicated OpenAI project for WorkMatch.
- Add billing or confirm billing is active.
- Create a project-scoped API key or service account key.
- Save the key in a password manager.
- Set a monthly budget and usage alert for the project.
- Confirm the project has access to the model you want to run.

Set these env vars:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_INPUT_COST_PER_1M_TOKENS=
OPENAI_OUTPUT_COST_PER_1M_TOKENS=
```

Notes:

- Do not put provider API keys in browser/client code.
- Keep keys only in `.env.local`, Vercel environment variables, or a secret manager.
- If the selected provider key is missing, the app will still work, but all AI features will use deterministic fallback output.

Official references:

- [Gemini API key setup](https://ai.google.dev/gemini-api/docs/api-key)
- [OpenAI project and API key management](https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects)
- [OpenAI API quickstart](https://platform.openai.com/docs/quickstart)

### 2. Supabase Database And Auth

Create a Supabase project for WorkMatch.

Do manually:

- Create a Supabase project.
- Copy the project URL.
- Copy the public client key.
- Copy the backend elevated key.
- Open the Supabase SQL editor.
- Run `supabase/schema.sql`.
- Enable Supabase Auth email/password sign-in.
- Decide whether email confirmation should be required.
- Create your first real user account through `/sign-up` or Supabase Auth.
- Decide the production organization id value you want to use.

Set these env vars:

```text
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=workmatch-uploads
WORKMATCH_AUTH_MODE=supabase
WORKMATCH_DEFAULT_ORGANIZATION_ID=
AUTH_SECRET=
```

Key mapping:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` can use Supabase's current publishable key, or the legacy `anon` key if that is what the project provides.
- `SUPABASE_SERVICE_ROLE_KEY` can use Supabase's current secret key, or the legacy `service_role` key if that is what the project provides.
- The backend elevated key must never be exposed in browser code.

Important production note:

- The current `supabase/schema.sql` covers organizations, profiles, employees, tasks, imports, imported records, assignments, settings, agent runs, audit events, tool calls, and monitoring events.
- Organization-scoped RLS policies are included and should still be reviewed by the production security owner before real employee data is used.
- The app writes business data through server-side routes using the Supabase service role key; do not expose that key to browser code.

Official reference:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

### 3. Microsoft 365 Intake

Local Microsoft Office file upload already works for `.xlsx` and `.docx`. Microsoft 365 cloud import is optional future work if users need to select files from OneDrive or SharePoint.

Do manually only if Microsoft 365 cloud import is in scope:

- Create or choose a Microsoft Entra app registration.
- Configure the redirect URI.
- Decide delegated permissions for Microsoft Graph file access.
- Add the local redirect URI:
  - `http://localhost:3000/api/auth/microsoft/callback`
- Add the production redirect URI after the domain is chosen:
  - `https://YOUR_DOMAIN/api/auth/microsoft/callback`
- Copy the client ID and client secret.

Set these env vars:

```text
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
MICROSOFT_GRAPH_SCOPES="Files.Read User.Read offline_access"
```

Current code limitation:

- Microsoft Graph OAuth, token storage, file picker, and OneDrive/SharePoint fetching are not built yet.
- This is not required for local Excel/Word/PDF/CSV upload.

### 4. Vercel Deployment

Create or choose a Vercel project for the Next.js app.

Do manually:

- Connect the repo to Vercel.
- Set the framework preset to Next.js if Vercel does not detect it automatically.
- Add every required environment variable for Production.
- Add the same variables for Preview if you want preview deployments to work.
- Redeploy after changing environment variables.
- Confirm the production build succeeds in Vercel.
- Add a custom domain when ready.
- Update `APP_URL` to the deployed domain.
- Update Microsoft redirect URIs to use the deployed domain if Microsoft 365 intake is enabled later.

Set these env vars in Vercel:

```text
NEXT_PUBLIC_APP_NAME=
APP_URL=
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
AUTH_SECRET=
WORKMATCH_AUTH_MODE=
WORKMATCH_DEFAULT_ORGANIZATION_ID=
AI_PROVIDER=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=
OPENAI_INPUT_COST_PER_1M_TOKENS=
OPENAI_OUTPUT_COST_PER_1M_TOKENS=
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_INPUT_COST_PER_1M_TOKENS=
GEMINI_OUTPUT_COST_PER_1M_TOKENS=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=
MICROSOFT_GRAPH_SCOPES=
```

Official reference:

- [Vercel environment variables](https://vercel.com/docs/environment-variables)

### 5. Local Environment

Create `.env.local` from `.env.example` and fill in the real values.

Local checks to run in a normal terminal:

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run dev
```

Notes:

- In the Codex desktop sandbox, `next build` compiled and then hit a sandbox `spawn EPERM` worker error.
- Run the final build/dev check in your normal terminal or in Vercel.

### 6. Production Smoke Test

After the provider accounts and environment variables are set, test this exact flow:

- Visit the deployed app.
- Confirm unauthenticated users are redirected to `/sign-in`.
- Create a user with `/sign-up`.
- Sign out and sign back in.
- Import a CSV file.
- Import an `.xlsx` file.
- Import a `.docx` file with a table.
- Import a selectable-text PDF.
- Confirm employee summaries show live or fallback status.
- Confirm task summaries show live or fallback status.
- Confirm match explanations show live or fallback status.
- Confirm dashboard insights show live or fallback status.
- Confirm manager copilot returns an answer.
- Confirm `GET /api/agent-runs` returns logged runs.
- Confirm Supabase `agent_runs` contains rows if Supabase persistence is configured.
- Confirm imports create rows in `imports`, `imported_records`, `employees`, and/or `tasks`.
- Confirm assignment approvals create rows in `assignments`.
- Confirm settings changes create/update `settings`.
- Confirm `/api/monitoring/summary` reports fallback rate, estimated AI cost, parser events, and route errors.
- Confirm no service keys or AI provider keys appear in the browser network payload.

## Environment Variable Matrix

| Variable | Required For | Where To Get It | Client Safe |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | App display name | You choose | Yes |
| `APP_URL` | Auth/callback/deployment links | Local or Vercel domain | Yes |
| `AI_PROVIDER` | Default AI provider switch | Set to `gemini` or `openai` | Server only |
| `GEMINI_API_KEY` | Live Gemini AI calls | Google AI Studio | No |
| `GEMINI_MODEL` | Live Gemini model choice | Gemini model docs/pricing | Server only |
| `GEMINI_INPUT_COST_PER_1M_TOKENS` | AI cost estimate | Your approved model pricing | Server only |
| `GEMINI_OUTPUT_COST_PER_1M_TOKENS` | AI cost estimate | Your approved model pricing | Server only |
| `OPENAI_API_KEY` | Live AI calls | OpenAI project API keys | No |
| `OPENAI_MODEL` | Live AI model choice | OpenAI model access | Server only |
| `OPENAI_BASE_URL` | OpenAI API base | OpenAI docs | Server only |
| `OPENAI_INPUT_COST_PER_1M_TOKENS` | AI cost estimate | Your approved model pricing | Server only |
| `OPENAI_OUTPUT_COST_PER_1M_TOKENS` | AI cost estimate | Your approved model pricing | Server only |
| `SUPABASE_URL` | Server Supabase calls | Supabase project settings | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth/client Supabase calls | Supabase project settings | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth/client Supabase calls | Supabase publishable or anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server persistence/admin writes | Supabase secret or service role key | No |
| `SUPABASE_STORAGE_BUCKET` | Future uploaded-file storage | You choose/create in Supabase | Server only |
| `AUTH_SECRET` | Session hardening/future signing | Generate a long random value | No |
| `WORKMATCH_AUTH_MODE` | Real auth mode | Set to `supabase` | Server only |
| `WORKMATCH_DEFAULT_ORGANIZATION_ID` | Org scoping | You choose or create in DB | Server only |
| `MICROSOFT_CLIENT_ID` | Future Microsoft 365 intake | Microsoft Entra app registration | Server only |
| `MICROSOFT_CLIENT_SECRET` | Future Microsoft 365 intake | Microsoft Entra app registration | No |
| `MICROSOFT_TENANT_ID` | Future Microsoft 365 intake | Microsoft Entra tenant | Server only |
| `MICROSOFT_REDIRECT_URI` | Future Microsoft callback | Your local/prod app URL | Server only |
| `MICROSOFT_GRAPH_SCOPES` | Future Microsoft Graph access | Approved Graph scopes | Server only |

## Remaining Build Work Before True Go-Live

These are code/product items, not account setup:

- Add Microsoft Graph OAuth callback, token storage, token refresh, OneDrive/SharePoint file fetching, and file-selection UI if cloud import is required.
- Add production parser dependencies or OCR if legacy `.xls`, binary `.doc`, scanned PDFs, or complex PDFs are required.
- Add invite/admin user management if multiple managers will use one organization.
- Add a production QA pass on the deployed app.

## Do Not Put These In Git

- `.env.local`
- OpenAI API keys
- Gemini API keys
- Supabase secret/service-role keys
- Microsoft client secrets
- Any downloaded production employee/task data

## Recommended Setup Order

1. Create Supabase project and run `supabase/schema.sql`.
2. Fill Supabase/Auth env vars locally.
3. Confirm sign-up and sign-in work locally.
4. Create a Gemini demo key or OpenAI project/API key.
5. Fill AI provider env vars locally.
6. Confirm AI routes return `Live` results instead of fallbacks.
7. Add provider token price env vars if cost estimates should show dollars instead of token-only tracking.
8. Connect Vercel and add Production env vars.
9. Deploy to Vercel.
10. Update `APP_URL` and Microsoft redirect URI to production domain if Microsoft 365 intake is enabled later.
11. Run the production smoke test above.
