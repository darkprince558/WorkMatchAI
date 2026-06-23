# WorkMatch Production Foundation Multi-Agent Setup

Status: active setup for the post-sprint production foundation pass
Branch: `codex/production-foundation`
Started: 2026-06-23

This setup coordinates the next WorkMatch implementation wave after the test harness, parser tests, Supabase verifier, documentation cleanup, and RAG foundation landed on `codex/add-test-harness`.

## Goal

Move WorkMatch from a credible demo-plus foundation toward a durable, tenant-safe SaaS foundation with document intelligence and the first integration lane.

## Active Workstreams

| Workstream | Owner | Primary scope | Must not touch |
| --- | --- | --- | --- |
| Persistence and tenant isolation | Persistence worker | Supabase verifier, tenant isolation tests, scoped REST/store behavior | RAG, agent tools, Google Sheets UI |
| RAG ingest and retrieval | RAG worker | Source document ingestion, document chunk insertion, tenant-filtered search API | Agent tools, Google Sheets |
| Read-only agent tools | Agent tools worker | Tool helpers for employees, tasks, matches, imports, document lookup abstraction | RAG implementation, schema, Google Sheets |
| Google Sheets intake | Google Sheets worker | Posted/connector-provided sheet data normalization, mapping, preview, review records | RAG, agent tools, Supabase schema |
| Coordinator | Main agent | Integration review, conflict resolution, full verification, final commit/push | Avoid rewriting owned worker scopes while active |

## Implementation Order

1. Land persistence and tenant isolation first, because every later workflow depends on organization boundaries.
2. Land RAG ingest/search next, because agent tools can depend on read-only retrieval.
3. Land read-only agent tools once the retrieval interface is stable.
4. Land Google Sheets intake independently, using the existing import review contract.
5. Run the full verification suite before commit:
   - `npm run verify:supabase:dry-run`
   - `npm run test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`

## Acceptance Criteria

- Tenant isolation tests fail if any WorkMatch persistence path omits `organization_id`.
- RAG ingestion creates tenant-scoped source document and chunk row drafts without live embedding calls.
- RAG search is tenant-filtered and returns citation-ready chunk/source metadata.
- Agent tools are read-only and do not commit authoritative writes.
- Google Sheets intake transforms tabular data into `ImportReviewRecord` objects with preview/validation metadata.
- Existing CSV, Excel, Word, PDF import tests continue to pass.
- Live Supabase verification remains credential-gated; dry-run must pass without secrets.

## Blockers And Defaults

- Live Supabase verification needs real `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`.
- Google OAuth is out of scope for this pass; accept posted or connector-provided Sheets data.
- Embeddings are out of scope for this pass; use full-text search and `embedding_status = "pending"`.
- Approval-gated write tools are out of scope for this pass; agent tools remain read-only.
