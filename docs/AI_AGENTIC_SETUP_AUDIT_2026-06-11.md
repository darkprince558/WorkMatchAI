# WorkMatch AI Agentic Setup Audit

Date: 2026-06-11  
Scope: Current AI/agentic implementation, provider readiness, account setup, missing capabilities, and recommended implementation plan.

## Executive Verdict

The current app has a strong product demo and useful AI planning scaffolding, but it does not yet have a working live AI agent.

What works today is a deterministic browser-side workflow: CSV import, manager review, matching scores, suggested team buckets, dashboard metrics, and template-based "AI" explanations. That is enough for a clickable prototype, but it is not enough for production AI behavior because there are no model calls, no server-side agent routes, no database persistence, no real auth/session enforcement, no Google file integration, and no durable audit trail.

The repo is in a good place to add AI because the team already created contracts, schemas, fallback outputs, review gates, auth permission constants, and database type contracts. The main work now is to connect those contracts to real server infrastructure and make a few schema/account decisions.

## Current State Summary

| Area | Current status | Would it work now? |
| --- | --- | --- |
| Matching engine | Deterministic local TypeScript logic in `lib/workmatch.ts` | Yes, for demo/local UI |
| AI explanations | Template strings generated locally | Yes, but not model-backed |
| AI agent contracts | Present in `lib/agents/*` | Partially, as planning/code scaffolding |
| Model provider client | Missing | No |
| API routes | Missing, no `app/api` routes found | No |
| Structured output validation | Basic shape checks only | Not production-ready |
| Persistence | Type contracts only in `lib/db/*` | No |
| Auth/roles | Permission constants only in `lib/auth/*` | No |
| Audit trail | Event constructors only in `lib/audit/*` | No |
| Google Docs/Sheets/Drive import | Planned in UI/docs only | No |
| CSV import | Browser-side parser and review flow | Yes |
| Settings | UI-local state only | No durable effect |
| Deployment linkage | `.vercel/project.json` exists | Partially |
| Env configuration | `.env.example` exists | Not wired into runtime |

## What Is Already Set Up

### App/Product Surface

- Next.js app with a browser-side prototype.
- Main workflow views for dashboard, import, employees, tasks, matching, assignments, and settings.
- CSV import path with confidence scoring and manager review before committing records.
- Matching view with employee-task compatibility, labels, team recommendations, priority mode, approval flow, and deterministic explanations.
- Dashboard view with deterministic insights based on current local data.
- Settings UI for AI behavior, data sources, review thresholds, and matching weights.

### Deterministic Matching Logic

Implemented in `lib/workmatch.ts`:

- Employee/task CSV parsing.
- Import record confidence scoring.
- Skill overlap scoring.
- Availability, location, experience, urgency, growth, and priority weighting.
- Match labels such as `Perfect`, `Strong`, `Good`, `Growth`, `Risky`, and `Not Recommended`.
- AI-style recommendation flag using deterministic thresholds.
- Team bucket generation.
- Dashboard metrics and skill gap analysis.

This gives the app a useful fallback path even after a real AI provider is added.

### AI Agent Scaffolding

Implemented in `lib/agents/*`:

- `contracts.ts`: shared agent request and response shapes.
- `schemas.ts`: JSON-schema-like specs for planned agent outputs.
- `requests.ts`: request builders and an `AgentModelClient` interface.
- `helpers.ts`: run envelope helpers, parse helpers, review checkpoints, score integrity checks.
- `fallbacks.ts`: deterministic fallback payloads for planned agent capabilities.

Planned agent names include:

- `document_extraction_assistance`
- `skill_normalization`
- `employee_summary`
- `task_summary`
- `match_explanation`
- `dashboard_insights`
- `manager_copilot`

### Persistence/Auth/Audit Planning

Implemented as contracts, not runtime behavior:

- `lib/db/schema.ts`: type definitions for employees, tasks, imports, imported records, assignments, settings, agent runs, and audit events.
- `lib/db/contracts.ts`: default settings, review gates, import and assignment contract helpers.
- `lib/auth/permissions.ts`: role and permission constants.
- `lib/audit/events.ts`: audit event builders.

These are a useful design foundation, but they do not currently connect to Supabase, a database, auth middleware, or real writes.

### Deployment/Environment Planning

- `.env.example` includes planned provider variables:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
  - `AUTH_SECRET`
- `.vercel/project.json` exists, so the project appears to be linked to Vercel already.

Important caution: `.vercel/project.json` contains local project linkage metadata and should generally stay out of public commits.

## Key Gaps And Risks

### 1. No Real AI Runtime Exists Yet

The app has contracts and fallback data, but there is no provider client and no API route that calls a model. The UI labels several sections as AI, but the behavior is deterministic and local.

Required work:

- Add a server-only model client.
- Add API routes under `app/api/agents/...`.
- Wire UI calls to those routes.
- Keep deterministic fallbacks for outages and cost control.
- Persist every AI run once the database exists.

### 2. Provider Drift: OpenAI Env Vars, Google SDK Dependency

The app currently has `@google/genai` installed but `.env.example` and planning point toward OpenAI with `OPENAI_API_KEY` and `OPENAI_MODEL`.

Recommendation:

- Choose one primary provider for the first production slice.
- Recommended first path: OpenAI direct API, because the existing env/docs already point there and OpenAI Structured Outputs fit the current contract-first design.
- Remove `@google/genai` if Gemini is not intentionally part of the architecture.
- If provider portability is important later, keep the `AgentModelClient` interface and add provider adapters after the first working OpenAI implementation.

### 3. Structured Output Schemas Need Tightening

OpenAI Structured Outputs are the right fit, but the current schemas are not guaranteed to be compatible as-is.

Known issue:

- OpenAI's Structured Outputs docs state that all fields must be required.
- Current local schemas include optional fields, especially nested source/reference fields and flexible recommendation metadata.
- Some schema areas allow open-ended properties, such as `additionalProperties: true`, which is weaker than ideal for strict agent contracts.

Recommendation:

- Convert optional output fields to required nullable fields.
- Prefer explicit enums and closed object shapes.
- Add actual runtime validation with Zod or another validator.
- Treat model output as untrusted until validated.

### 4. Agent Name Mismatch Between AI Contracts And DB Contracts

`lib/agents/contracts.ts` and `lib/db/schema.ts` use different agent name vocabularies.

Examples:

- AI contracts use `document_extraction_assistance`; DB types use `document_intake`.
- AI contracts use `match_explanation`; DB types use `matching_recommendation`.
- AI contracts use `dashboard_insights`; DB types use `workforce_insights`.

Why this matters:

- Once `agent_runs` are persisted, mismatched names will create awkward mapping code, weak analytics, and type drift.

Recommendation:

- Create one canonical `AgentName` type and import it everywhere.
- Use explicit capability names that map to product behavior, not internal implementation details.

### 5. Database Layer Is Only Types

There is no database client, migration, RLS policy, storage bucket setup, or repository layer.

Required work:

- Create actual Supabase schema migrations.
- Add server-only Supabase admin client.
- Add browser/client Supabase client if using Supabase Auth.
- Implement RLS policies for user/team-scoped data.
- Add persistence adapters for employees, tasks, imports, assignments, agent runs, and audit events.

### 6. Auth Is Not Enforced

Role and permission definitions exist, but there is no login/session implementation and no route protection.

Required work:

- Pick auth provider.
- Recommended: Supabase Auth if Supabase is also the database, unless the product already has another auth direction.
- Add middleware/session helpers.
- Enforce role checks in API routes.
- Add organization/team ownership to persisted records.

### 7. Google Workspace Intake Is Planned, Not Built

The UI says Google Docs, Sheets, Drive, Excel, PDF, and Word imports are planned. Only CSV works.

Required work:

- Google OAuth app setup.
- Drive/Docs/Sheets APIs enabled.
- OAuth callback route.
- Token storage strategy.
- Picker/import flow.
- Parsers for Sheets, Docs, Excel, PDF, and Word.
- Human review queue before records affect matching.

### 8. Settings UI Does Not Control Runtime Behavior

The settings screen keeps local React state. It does not update global state, server config, matching weights, review policy, or provider behavior.

Recommendation:

- Split settings into:
  - User preferences.
  - Organization matching policy.
  - AI review policy.
  - Provider/runtime configuration.
- Persist organization settings.
- Apply settings in both deterministic scoring and AI route prompts.

### 9. No Durable Audit Trail

Audit event constructors exist but no events are saved.

This is important because WorkMatch appears to operate on employee/work assignment data. Manager decisions, AI recommendations, overrides, imports, and assignments should be traceable.

Required audit events:

- Import uploaded.
- Import record accepted/rejected/corrected.
- AI run started/completed/failed.
- Match recommendation generated.
- Manager approved/rejected recommendation.
- Assignment created/changed.
- Settings changed.
- Google source connected/disconnected.

### 10. Verification Was Mostly Good, With One Sandbox Limitation

Checks run with bundled workspace Node:

- ESLint completed successfully with warnings only.
- TypeScript completed successfully.
- Next build compiled successfully, then failed with `spawn EPERM` after type checking in the sandboxed environment.

Current lint warnings:

- `@next/next/no-img-element` in:
  - `components/Header.tsx`
  - `components/views/EmployeesView.tsx`
  - `components/views/MatchingView.tsx`
  - `components/views/TasksView.tsx`

Recommendation:

- Re-run production build in a normal local terminal or with approved elevated execution.
- The AI audit did not require fixing these image warnings.

## Capability Matrix

| Capability | Current implementation | Missing for production | Recommendation |
| --- | --- | --- | --- |
| CSV employee/task import | Browser-side CSV parsing, confidence scoring, review flow | Persistence, validation hardening, audit events | Keep as first working intake path; persist reviewed records |
| Excel import | UI says planned | Parser and review pipeline | Add `exceljs` or similar and route through same import review model |
| PDF import | UI says planned | Text extraction/OCR, review pipeline | Add parser later; require human review for low confidence fields |
| Word/Docs import | UI says planned | Doc parser, Google Docs API, normalization | Build after CSV and Sheets are stable |
| Google Sheets import | UI says planned | OAuth, Sheets API, selected-file permission, parser | Prefer `drive.file` plus Picker over broad Drive read scopes |
| Skill normalization | Agent contract and fallback exist | Model route, validation, canonical skill table | Make this one of the first live AI routes |
| Employee summary | Agent contract and fallback exist | Model route, persistence, UI wiring | Useful early AI feature with low risk |
| Task summary | Agent contract and fallback exist | Model route, persistence, UI wiring | Useful early AI feature with low risk |
| Match explanation | Contract/fallback exists; deterministic explanation used now | Model route and score integrity guard | Add after deterministic scoring remains source of truth |
| Matching recommendation | Deterministic scoring exists | Optional AI explanation only; do not let model change score directly | Keep scores deterministic; AI explains and flags caveats |
| Dashboard insights | Deterministic insights exist | Model route, persisted agent run, citations to metrics | Add model narrative after metrics are server-backed |
| Manager copilot | Contract/fallback exists | Tool calling, permissions, action proposals, review gates | Build last; require human approval for state changes |
| Assignments | Local state only | DB writes, auth, audit, conflict checks | Add after persistence/auth |
| AI settings | Local UI only | Durable org settings and route integration | Persist settings before exposing provider controls |
| Auditability | Event builders only | Durable audit table and writes | Implement before production AI actions |
| Auth/RBAC | Permission constants only | Real login, sessions, route checks, RLS | Implement before production data |
| Observability | None found | Logs, traces, model cost/error metrics | Add around AI routes and imports |

## Recommended Target Architecture

### Principles

- Deterministic matching remains the source of truth for scores.
- AI explains, normalizes, summarizes, and proposes actions.
- AI should not silently mutate employees, tasks, assignments, or settings.
- Every AI output is validated against a strict schema.
- Every AI run and manager decision is persisted and auditable.
- Imported external data always enters a human review queue first.

### Suggested Runtime Flow

```text
UI action
  -> Next.js API route
  -> auth + permission check
  -> input validation
  -> deterministic context builder
  -> AgentModelClient
  -> strict structured output validation
  -> review gate / confidence gate
  -> persistence: agent_runs + audit_events
  -> UI renders result with fallback if needed
```

### Recommended Server Modules

```text
lib/agents/model-client.ts
lib/agents/openai-client.ts
lib/agents/validation.ts
lib/agents/run-agent.ts
lib/db/client.ts
lib/db/repositories/*
lib/auth/session.ts
lib/imports/*
app/api/agents/*
app/api/imports/*
app/api/google/*
```

## Recommended API Routes

Build these in this order:

1. `POST /api/agents/employee-summary`
   - Input: employee profile.
   - Output: concise summary, strengths, risks, manager review flag.
   - Why first: low risk, easy to validate, useful in UI.

2. `POST /api/agents/task-summary`
   - Input: task profile.
   - Output: task summary, required capabilities, staffing caveats.
   - Why second: also low risk and improves task review.

3. `POST /api/agents/skill-normalization`
   - Input: imported skill names.
   - Output: canonical skill mapping and confidence.
   - Why third: unlocks cleaner imports and matching.

4. `POST /api/agents/match-explanation`
   - Input: deterministic score breakdown, employee, task.
   - Output: explanation, evidence, risks, recommendation caveats.
   - Guardrail: model cannot change score; it can only explain or flag uncertainty.

5. `POST /api/agents/dashboard-insights`
   - Input: server-calculated metrics.
   - Output: insights, risks, recommended staffing actions.
   - Guardrail: all insights should cite source metrics.

6. `POST /api/agents/document-extraction-assistance`
   - Input: parsed rows/text from uploaded file.
   - Output: proposed employee/task records and field confidence.
   - Guardrail: human review required before commit.

7. `POST /api/agents/manager-copilot`
   - Input: manager prompt and allowed tools.
   - Output: answer plus proposed actions.
   - Guardrail: actions are proposals until manager approval.

## Accounts And Services To Set Up

### 1. OpenAI Platform

Purpose:

- Live model calls for structured summaries, skill normalization, explanations, insights, and copilot behavior.

Set up:

- Create or use an OpenAI Platform organization.
- Create a dedicated project for WorkMatch.
- Create a service account or project-scoped API key.
- Store `OPENAI_API_KEY` server-side only.
- Set `OPENAI_MODEL`, for example to the current chosen production model.
- Configure billing limits and usage monitoring.
- Use least-privilege access and rotate keys regularly.

Recommended permissions:

- Responses API access.
- Service-account/project key only, not a personal user key.
- Separate production and preview/development keys if possible.

Notes:

- OpenAI recommends Structured Outputs instead of plain JSON mode when schema adherence matters.
- OpenAI's RBAC docs recommend least privilege, separation of duties, project boundaries, and key rotation.

### 2. Vercel

Purpose:

- App deployment and environment management.

Current state:

- The project appears linked in `.vercel/project.json`.

Set up:

- Add environment variables in Vercel for Development, Preview, and Production.
- Add:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
  - `AUTH_SECRET`
- Pull env vars locally with Vercel CLI after they are configured.
- Use different values for Preview and Production if real employee data is involved.

Notes:

- Vercel env var changes affect new deployments, not old deployments.
- Preview deployments should be protected if they contain sensitive employee data.

### 3. Supabase

Purpose:

- Postgres database, auth, storage, and row-level security.

Set up:

- Create a Supabase project.
- Create tables from the planned contracts:
  - employees
  - tasks
  - imports
  - imported_records
  - assignments
  - settings
  - agent_runs
  - agent_tool_calls
  - audit_events
- Create a private storage bucket, for example `workmatch-uploads`.
- Enable RLS on exposed tables.
- Store `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Use `SUPABASE_ANON_KEY` only with RLS-safe browser operations.

Important:

- Supabase docs say RLS must be enabled on tables in exposed schemas.
- Supabase service keys bypass RLS and must never be exposed publicly.

### 4. Google Cloud / Google Workspace

Purpose:

- Import from Google Drive, Google Docs, and Google Sheets.

Set up:

- Create a Google Cloud project.
- Configure OAuth consent screen.
- Create an OAuth web client.
- Enable:
  - Google Drive API
  - Google Docs API
  - Google Sheets API
- Add authorized redirect URIs exactly:
  - Local callback, for example `http://localhost:3000/api/google/oauth/callback`
  - Production callback, for example `https://YOUR_DOMAIN/api/google/oauth/callback`
- Store:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`

Recommended scope strategy:

- Prefer `drive.file` plus Google Picker or app-created/selected files.
- Avoid broad `drive.readonly` or full `drive` unless absolutely required.
- Broad/restricted scopes can trigger extra verification and security assessment requirements.

Decision needed:

- OAuth per manager is recommended if managers connect their own Google files.
- Service account/domain-wide delegation is only appropriate if this is an admin-managed Google Workspace workflow.

### 5. Optional Observability

Purpose:

- Track AI errors, latency, cost, fallbacks, and confusing outputs.

Options:

- Vercel logs/observability.
- Sentry.
- Datadog/Logtail/OpenTelemetry.

Minimum events to track:

- AI route success/failure.
- Model name.
- Token usage/cost if available.
- Fallback used.
- Validation failure.
- Human review required.

## Environment Variables

Recommended minimum:

```text
OPENAI_API_KEY=
OPENAI_MODEL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

AUTH_SECRET=
APP_BASE_URL=
```

Notes:

- Browser-exposed Supabase variables should use `NEXT_PUBLIC_...`.
- Server-only secrets must not use `NEXT_PUBLIC_...`.
- The current `.env.example` should be updated once the final provider/db/auth choice is confirmed.

## Data Model Recommendations

### Tables To Add First

1. `organizations`
2. `profiles`
3. `employees`
4. `tasks`
5. `assignments`
6. `imports`
7. `imported_records`
8. `agent_runs`
9. `audit_events`
10. `settings`

### Tables To Add Before Manager Copilot

1. `agent_tool_calls`
2. `proposed_actions`
3. `action_reviews`

### Important Fields

For `agent_runs`:

- `id`
- `organization_id`
- `agent_name`
- `model`
- `input_hash`
- `request`
- `response`
- `status`
- `confidence`
- `review_required`
- `error`
- `created_by`
- `created_at`

For `audit_events`:

- `id`
- `organization_id`
- `actor_id`
- `event_type`
- `entity_type`
- `entity_id`
- `before`
- `after`
- `metadata`
- `created_at`

For `imported_records`:

- `id`
- `import_id`
- `record_type`
- `raw_data`
- `normalized_data`
- `confidence`
- `status`
- `review_notes`
- `created_at`

## Guardrails Needed

### Matching Guardrails

- Model cannot directly set final match score.
- Model can explain score components and flag missing/contradictory data.
- Manager approval required before assignment creation.
- Risky/low-confidence matches require explicit review.

### Import Guardrails

- Low confidence fields must be reviewed by a human.
- External document extraction cannot directly create employees/tasks.
- Every accepted import row should retain source reference and original raw value.

### Copilot Guardrails

- Copilot tools should start read-only.
- State-changing tools should produce proposed actions, not direct writes.
- Each action should require manager confirmation.
- Tool access should be constrained by role and organization.

### Privacy Guardrails

- Avoid sending unnecessary employee personal data to the model.
- Include only fields needed for the specific agent task.
- Avoid logging raw secrets or full sensitive documents.
- Add retention rules for uploaded files and AI request payloads.

## Phased Implementation Plan

### Phase 0: Align The AI Stack

Goal: Remove ambiguity before implementing runtime code.

Tasks:

- Choose primary model provider.
- Recommended: OpenAI direct API first.
- Add explicit dependencies:
  - `openai`
  - `zod`
  - `@supabase/supabase-js`
  - `googleapis` later when Google import starts
- Remove `@google/genai` if Gemini is not planned.
- Align `.env.example` with actual runtime variable names.
- Create one canonical `AgentName` type shared by AI and DB contracts.

### Phase 1: Make One AI Route Actually Work

Goal: Prove the model can be called, validated, displayed, and safely fallback.

Recommended first route:

- `POST /api/agents/employee-summary`

Tasks:

- Implement server-only OpenAI client.
- Convert one output schema to strict Structured Output shape.
- Validate model output at runtime.
- Return deterministic fallback on provider failure.
- Show generated summary in employee detail UI.

Acceptance criteria:

- Missing API key fails clearly.
- Invalid model output is rejected.
- UI shows fallback when model call fails.
- No secret is exposed to the browser.

### Phase 2: Add Core AI Capabilities

Goal: Add the low-risk AI features users will notice.

Tasks:

- Add `task-summary`.
- Add `skill-normalization`.
- Add `match-explanation`.
- Add `dashboard-insights`.
- Add UI loading/error states.
- Preserve deterministic matching scores as source of truth.

Acceptance criteria:

- AI explanations cite score components.
- Skill normalization confidence is shown during import review.
- Low-confidence AI output requires manager review.

### Phase 3: Add Persistence, Auth, And Audit

Goal: Move from prototype to durable app behavior.

Tasks:

- Create Supabase migrations.
- Add auth/session middleware.
- Add RLS policies.
- Persist employees, tasks, imports, assignments, settings, agent runs, audit events.
- Move local state workflows to server-backed data.

Acceptance criteria:

- Refreshing the page does not lose data.
- Users only see organization-scoped data.
- AI runs and manager approvals are auditable.

### Phase 4: Add Document And Google Intake

Goal: Expand beyond CSV safely.

Tasks:

- Implement Google OAuth.
- Implement Google Picker or selected-file access.
- Add Sheets import.
- Add Docs import.
- Add Excel/PDF/Word parsing.
- Route all extracted records through review.

Acceptance criteria:

- Imported data shows source file and field confidence.
- Manager can correct records before commit.
- Broad Google scopes are avoided unless truly required.

### Phase 5: Add Manager Copilot

Goal: Add agentic workflows after the data/auth/audit foundation exists.

Tasks:

- Add read-only tools for searching employees, tasks, assignments, and skill gaps.
- Add proposed-action format.
- Add review/approval UI.
- Add audit events for tool calls and action approvals.

Acceptance criteria:

- Copilot can answer operational questions.
- Copilot cannot silently change assignments.
- Every proposed action is reviewable and auditable.

## Minimum Viable AI Slice

If the goal is to make "the AI part" real as fast as possible, build this first:

1. Pick OpenAI as the provider.
2. Add `openai` and `zod`.
3. Implement `lib/agents/openai-client.ts`.
4. Create `POST /api/agents/employee-summary`.
5. Use strict structured output.
6. Validate with Zod.
7. Add UI fetch/loading/error/fallback state.
8. Keep all secrets server-only.

This does not require Supabase or Google yet, and it will quickly prove the model integration path.

## Recommended Feature List For The AI Product

### MVP AI Features

- AI employee summary.
- AI task summary.
- AI skill normalization during import.
- AI match explanation based on deterministic score breakdown.
- AI dashboard insights based on server-calculated metrics.
- Human review gates for low-confidence AI outputs.
- Deterministic fallback explanations when model calls fail.

### Near-Term AI Features

- Google Sheets import assistance.
- Google Docs import assistance.
- Excel import assistance.
- Skill taxonomy management.
- Assignment risk explanation.
- Staffing gap suggestions.
- Manager-visible AI run history.

### Later Agentic Features

- Manager copilot chat.
- Read-only workforce search tools.
- Proposed assignment actions.
- Proposed task staffing plans.
- Proposed employee development plans.
- Multi-step document intake with review checkpoints.
- Tool-call audit timeline.

## Questions For The Product Owner

1. Should WorkMatch use OpenAI as the primary AI provider, or is Gemini/Google AI required?
2. Should Supabase be the production database/auth/storage provider, or do you already have a different backend planned?
3. Will managers import their own Google files through OAuth, or will the company connect one shared/admin Google Workspace source?
4. Is this app expected to handle real employee data soon? If yes, privacy, retention, and access controls should be treated as launch blockers.
5. Should this folder be initialized as a Git repo, or is it inside a larger repo not visible from this workspace?

## Recommended Decisions

My recommended default choices:

- AI provider: OpenAI direct API first.
- AI SDK style: direct provider client behind the existing `AgentModelClient` interface.
- Output mode: Structured Outputs with runtime validation.
- Database/auth/storage: Supabase.
- Deployment: Vercel.
- Google access: OAuth per manager using narrow scopes, preferably `drive.file`.
- Matching authority: deterministic engine owns final scores; AI explains and proposes.
- Agentic actions: human approval required before writes.

## Source Notes

Official docs consulted:

- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI model docs: https://developers.openai.com/api/docs/guides/latest-model
- OpenAI RBAC and project permissions: https://developers.openai.com/api/docs/guides/rbac
- OpenAI Agents SDK TypeScript: https://openai.github.io/openai-agents-js/
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel deployment environments: https://vercel.com/docs/deployments/environments
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Google OAuth web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Drive API scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Docs API authorization scopes: https://developers.google.com/workspace/docs/api/auth
- Google Sheets API authorization scopes: https://developers.google.com/workspace/sheets/api/scopes

