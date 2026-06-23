# AI Routes Implementation Plan

Status: historical implementation plan. Current agent capability status is summarized in `docs/PRODUCT_READINESS_AUDIT_2026-06-19.md`.
Last updated: June 10, 2026

Owner: AI Routes Agent

## Scope Completed In This Pass

This pass created the model-backed contract scaffolding under `lib/agents/*`.

Implemented contract surfaces:

- Document extraction assistance
- Skill normalization
- Employee summary
- Task summary
- Match explanation
- Dashboard insights
- Manager copilot

The scaffolding is provider-neutral. Future route handlers can pass the exported request objects to OpenAI, Vercel AI SDK, Google GenAI, or another structured-output client without changing the contract types.

## Files Added

- `lib/agents/contracts.ts`
  - Shared envelope, source references, warnings, review checkpoints, audit metadata, deterministic score reference, and all agent input/output types.
- `lib/agents/schemas.ts`
  - Provider-neutral JSON schema specs for model structured outputs.
  - The match explanation model schema intentionally excludes match score fields.
- `lib/agents/requests.ts`
  - Request builders for each agent contract plus a small `AgentModelClient` interface.
- `lib/agents/helpers.ts`
  - Envelope builders, fallback envelope builder, model JSON parsing, confidence review helpers, review checkpoint helper, and deterministic score integrity checks.
- `lib/agents/fallbacks.ts`
  - Deterministic fallback payloads for all current agent surfaces.
- `lib/agents/index.ts`
  - Public exports for future API routes.

## Deterministic Scoring Boundary

AI routes must not produce match percentages.

The route flow for match explanations should be:

1. Call deterministic scoring code outside `lib/agents`.
2. Build a `DeterministicMatchScore` from that score result.
3. Call `buildMatchExplanationRequest(...)`.
4. Parse the model response as `MatchExplanationModelOutput`.
5. Attach the score with `createMatchExplanationOutput(...)`.
6. Validate with `validateMatchExplanationScoreIntegrity(...)`.
7. Return or persist the result inside `AgentOutputEnvelope<MatchExplanationOutput>`.

The model-facing response schema does not include `totalScore`, `label`, or component score fields. Those values are attached by application code only.

## Future API Route Shape

Suggested routes once the coordinator approves editing `app/api/*`:

- `POST /api/agents/document-extraction`
- `POST /api/agents/skill-normalization`
- `POST /api/agents/employee-summary`
- `POST /api/agents/task-summary`
- `POST /api/agents/match-explanation`
- `POST /api/agents/dashboard-insights`
- `POST /api/agents/manager-copilot`

Each route should:

1. Validate request input.
2. Create or reserve an `agentRunId`.
3. Build the structured model request from `lib/agents/requests`.
4. Use fallback builders when no model provider is configured or the model call fails.
5. Wrap output with `createAgentEnvelope(...)` or `createFallbackEnvelope(...)`.
6. Persist `agent_runs`, `agent_tool_calls`, and audit events when persistence is available.
7. Require manager review checkpoints before imports, skill ratings, recommendations, assignments, or bulk changes become authoritative.

## Review Requirements

- Confidence below `0.75` requires manager review.
- AI-estimated skill ratings always require `confirm_estimated_rating`.
- Semantic skill mappings, aliases, and new taxonomy entries require `confirm_skill_mapping`.
- Import batches require `confirm_import`.
- Recommendations require `confirm_recommendation`.
- Assignments require `confirm_assignment`.
- Copilot may draft actions, but explicit manager confirmation is required before any durable write.

## Follow-Up Work

- Add route handlers after API ownership is cleared.
- Add direct Zod schemas if `zod` becomes a declared dependency.
- Add contract tests for valid output, fallback output, validation failure, and score integrity.
- Wire persistence/audit once the Persistence And Governance Agent finalizes storage.
