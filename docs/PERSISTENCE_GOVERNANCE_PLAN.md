# Persistence And Governance Plan

## Architecture Default

Use Supabase Postgres for durable WorkMatch data, with Supabase Auth as the default identity boundary. The current pass adds TypeScript contracts only; future API route work can use `Database` from `lib/db/schema.ts` as the Supabase client generic once the runtime client is installed and configured.

## Contracted Tables

- `employees` and `tasks` hold approved source-of-truth staffing data.
- `imports` and `imported_records` hold parsed upload output before manager review.
- `assignments` stores one employee-to-task assignment row per approved or proposed staffing decision.
- `settings` stores organization, team, or user scoped WorkMatch settings.
- `agent_runs` stores traceability for model-backed or deterministic agent workflows.
- `audit_events` records manager, agent, and system changes to durable state.

## Governance Rules

- Imported employees, tasks, and roster assignments stay in `imported_records` until a manager confirms them.
- Assignment rows created by matching or roster import begin as `pending_review`; only manager approval can make them authoritative.
- Settings changes must create `settings_changed` audit events.
- Agent runs must record fallback state, deterministic-score usage, model metadata when present, and related audit events.
- Deterministic code remains the only source of match percentages.

## Migration Notes

The first Supabase migration should create the contracted tables in `lib/db/schema.ts`, use `uuid` primary keys, add `organization_id` to every table, store source references and payloads as `jsonb`, and add indexes on:

- `employees(organization_id, external_employee_id)`
- `tasks(organization_id, external_task_id)`
- `imported_records(organization_id, import_id, review_status)`
- `assignments(organization_id, task_id, employee_id, status)`
- `settings(organization_id, scope, key)`
- `agent_runs(organization_id, agent_name, status, started_at)`
- `audit_events(organization_id, target_type, target_id, created_at)`

Row-level security should restrict all tables by `organization_id`, with service-role access reserved for server-side agent execution and audit writes.
