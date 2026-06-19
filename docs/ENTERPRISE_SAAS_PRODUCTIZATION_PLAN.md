# WorkMatch AI Enterprise SaaS Productization Plan

Status: portfolio-first architecture plan
Audience: resume project with an enterprise-ready growth path
Goal: make WorkMatch AI demonstrate credible enterprise SaaS architecture while keeping actual operating costs low until real validation exists.

## Product Direction

WorkMatch AI should be positioned first as a strong portfolio project that can credibly grow into a multi-tenant workforce intelligence SaaS. The architecture should show how organizations could import employee/project data, match people to work, explain staffing recommendations, and ask an AI copilot questions over trusted workforce context.

The project should no longer read as a company-specific demo. It should read as a standalone portfolio product with enterprise patterns:

- Organization accounts and member invitations.
- Role-based permissions.
- Tenant-isolated data and files.
- Auditable AI and manager actions.
- Human approval before imports, skill ratings, staffing assignments, or bulk changes.
- RAG-backed copilot with citations.
- Integrations with the tools companies already use for projects, docs, spreadsheets, HR data, and capacity planning.
- Cost, fallback, and model-run monitoring.
- Production deployment with a clear demo tenant.

## Recommended Stack

Use this stack as the enterprise-ready target architecture, but only turn on paid tiers when the portfolio demo or real validation justifies them:

| Layer | Choice | Why |
| --- | --- | --- |
| Hosting | Vercel Hobby for portfolio demo; Vercel Pro only for commercial launch | Professional deployment path without paying before validation. |
| Auth and organizations | Clerk Organizations | Strong B2B SaaS feel: organization switcher, invitations, roles, polished sign-in/sign-up, and future enterprise SSO path. |
| Database | Supabase Postgres | Existing schema already targets Supabase. Postgres is credible, relational, and works well for tenant-scoped workforce data. |
| File storage | Supabase Storage first | Keeps private workforce documents close to tenant-aware Postgres policies and source metadata. |
| Vector search / RAG | pgvector in Supabase Postgres | Cheap and simple first RAG layer; avoids a separate vector database until scale demands one. |
| AI runtime | Current agent routes plus Vercel AI SDK / AI Gateway migration | Existing agent contracts are valuable; AI SDK adds streaming, tool calling, gateway observability, and human approval patterns. |
| Integrations | Connector framework with OAuth, sync jobs, source records, and field mapping | Makes WorkMatch the AI layer over existing systems instead of another manual data silo. |
| Rate limiting / queues | Start with current in-memory/server route limits; add Upstash Redis when public traffic starts | Keeps early cost low while leaving a clean path to durable rate limits and background jobs. |
| Billing | Defer paid billing; document Stripe or Clerk Billing as a later path | Product quality and portfolio clarity matter first. Billing becomes optional proof of enterprise readiness. |

## Positioning Decision

Treat WorkMatch AI as a resume project with enterprise architecture, not an active commercial SaaS until there is real user demand.

This means:

- Keep the product polished and credible enough to show publicly.
- Avoid recurring paid services unless they materially improve the demo or portfolio story.
- Prefer free tiers, mock providers, deterministic fallback, and documented setup paths.
- Build the core architecture so a future enterprise move is straightforward.
- Validate demand before committing to expensive connector platforms, higher auth tiers, paid observability, or production SLAs.

## Why This Beats A Hobby Stack

This stack makes the project look like a real B2B SaaS without requiring an expensive enterprise bill up front:

- Clerk provides the product polish users expect from SaaS auth.
- Supabase gives a serious Postgres foundation with RLS, storage, and vectors.
- Vercel gives a deployable, shareable, professional web presence.
- The app already has differentiated AI workflow contracts rather than generic chatbot code.
- The data model can demonstrate multi-tenancy, auditability, and human-in-the-loop AI.

## Cost Posture

Start with the lowest-cost version that still tells a strong engineering story:

- Use Vercel Hobby for portfolio hosting unless commercial use begins.
- Use Clerk free/Hobby during build. Move to Clerk Pro only if branding, MFA, or org limits become a blocker.
- Use Supabase free or low-tier project for development and demo tenants. Move up only when database size, uptime, or support needs justify it.
- Keep RAG in Postgres with pgvector first. Do not add Pinecone/Qdrant until vector volume or latency proves the need.
- Keep AI features behind explicit per-organization limits and deterministic fallback.
- Keep connector tools on free tiers or mocked flows until the integration demo requires live OAuth.

## Tenant Model

Canonical tenant id should be the application `organization_id`, with external provider mappings:

- `organizations.id`: internal UUID or stable slug.
- `organizations.auth_provider`: `clerk`.
- `organizations.external_auth_org_id`: Clerk organization id.
- Every business table keeps `organization_id`.
- Every storage object path starts with `org/{organization_id}/`.
- Every vector row keeps `organization_id`.
- Every agent run keeps `organization_id`, `triggered_by_user_id`, cost fields, fallback state, and source refs.

No query, model call, vector search, file read, or dashboard metric should run without organization context.

## Enterprise AI Feature Set

Build these in priority order:

1. RAG document vault
   - Upload resumes, employee skill sheets, project docs, and staffing notes.
   - Parse into source documents and chunks.
   - Embed chunks with tenant metadata.
   - Search with `organization_id` filters.
   - Return citations in copilot answers and match explanations.

2. Agentic manager copilot
   - Tools: search employees, search tasks, retrieve document chunks, inspect match scores, draft assignment review.
   - Human approval required before any write action.
   - Stream responses in the UI.

3. AI extraction and normalization
   - Parse documents into proposed employees/tasks/skills.
   - Normalize skill names and infer levels only as reviewable proposals.
   - Never commit imported records without manager approval.

4. Explainable matching
   - Deterministic code remains the only source of match percentages.
   - AI explains score components and cites evidence.
   - Low confidence or missing evidence produces warnings.

5. Observability and governance
   - AI run history.
   - Token/cost estimates.
   - Fallback rate.
   - Parser failure rate.
   - Audit trail for approvals and settings changes.

6. Integration hub
   - Connect Google Sheets, Notion, ClickUp, Jira, Linear, Asana, monday.com, Microsoft 365, and selected HRIS systems over time.
   - Normalize external records into WorkMatch employees, tasks, assignments, source documents, and skill evidence.
   - Use connected data for RAG and matching while keeping writes approval-gated.
   - See `docs/INTEGRATIONS_STRATEGY.md` for the connector architecture.

## Portfolio Signals To Highlight

The public README and portfolio writeup should explicitly call out:

- Multi-tenant B2B SaaS architecture.
- Organization-scoped auth and RBAC.
- Tenant-isolated RAG using Postgres and pgvector.
- Agentic workflows with structured outputs.
- Human-in-the-loop approvals for AI actions.
- Deterministic scoring with AI explanations.
- Source citations and audit logs.
- Production monitoring for cost and fallback behavior.
- Vercel deployment and real cloud infrastructure.

## Implementation Waves

### Wave 1 - Rebrand And Tenant Shell

Acceptance:

- Remove company-specific copy from the product surface and README.
- Add product-positioning copy for WorkMatch AI.
- Keep demo data but frame it as seeded sample tenant data.
- Confirm every route and API path resolves organization context.

### Wave 2 - Clerk Organization Auth

Acceptance:

- Install Clerk and configure Next.js middleware.
- Add organization-aware sign-in, sign-up, and organization switching.
- Map Clerk users and orgs into local `profiles` and `organizations`.
- Replace demo auth context with real Clerk-derived auth context.
- Preserve local fallback only for explicit development mode.

### Wave 3 - Supabase Production Data

Acceptance:

- Run and verify Supabase schema.
- Add migration notes for pgvector and document storage.
- Ensure every table has `organization_id` and indexes for tenant filters.
- Add integration tests for cross-tenant isolation.
- Keep manager actions auditable.

### Wave 4 - Document Vault And RAG

Acceptance:

- Add source document and chunk tables.
- Store uploaded files in tenant-scoped storage paths.
- Generate embeddings for chunks.
- Add tenant-filtered vector retrieval function.
- Add source citations to copilot answers.

### Wave 5 - Integration Hub

Acceptance:

- Add connector registry and admin integrations page.
- Add first cloud connectors for Google Sheets, Notion, and ClickUp.
- Add source record tracking and field mapping.
- Add manual sync with sync health reporting.
- Feed synced documents and structured records into RAG/review flows.

### Wave 6 - Agentic Copilot Upgrade

Acceptance:

- Add streaming manager copilot UI.
- Add tool-calling layer for read-only workforce tools.
- Add approval-gated write tools for assignment drafts and import commits.
- Persist tool calls and agent runs.
- Add cost and fallback monitoring.

### Wave 7 - Enterprise Dashboard Polish

Acceptance:

- Add visual analytics for utilization, skill gaps, match quality, staffing risk, and AI costs.
- Add tenant admin settings.
- Add onboarding/demo tenant setup.
- Add public landing page and product docs.

## Non-Negotiable Safety Rules

- AI never generates or overwrites match percentages.
- AI never commits imports, ratings, assignments, or bulk changes without human review.
- RAG retrieval is always tenant-filtered.
- Private files are never public by URL.
- Service-role database or storage keys never reach browser code.
- Every approval and AI-assisted write creates an audit event.
- Every public environment has spend limits or rate limits before launch.

## Later Upgrade Paths

Only add these when the core product is stable:

- Upstash Redis for durable rate limiting and job locks.
- Inngest, Trigger.dev, or Vercel Workflow for background ingestion and long-running agent jobs.
- Pinecone/Qdrant if pgvector search becomes too slow or too large.
- WorkOS/Auth0 if enterprise SSO becomes a core sales feature.
- Stripe or Clerk Billing for paid tenant plans.
- SOC 2-style security page and trust center content.

