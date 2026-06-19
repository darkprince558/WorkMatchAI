# WorkMatch AI - Agentic Workflow Contracts

This document defines the first concrete contracts for the planned WorkMatch agents. These contracts are future API boundaries for `lib/agents/*`, `app/api/*`, stored `agent_runs`, and manager review screens.

The controlling rule is:

```text
AI agents extract, normalize, summarize, and explain.
Deterministic code calculates scores, applies constraints, and saves approved decisions.
Managers approve imports, estimated ratings, and assignments before they become final.
```

## 0. Demo Boundary and Future API Path

These contracts are documentation-first for the demo. They describe the intended implementation path for future AI features and should not be presented as live model-backed routes unless the corresponding APIs, schemas, persistence, and review screens exist.

Demo-safe language:

- The demo uses deterministic matching and sample data to show the manager workflow.
- Future agents will extract documents, normalize skills, explain score breakdowns, draft recommendations, and surface workforce insights.
- AI outputs will be treated as proposals with confidence, evidence, source references, warnings, and required review checkpoints.
- Deterministic code will continue to own scoring, hard constraints, capacity math, label thresholds, and durable saves.
- Managers will approve final imports, AI-estimated ratings, recommendations, assignments, and bulk changes before they affect source-of-truth records.

Future API boundary:

- `lib/agents/*` should contain agent orchestration and schema validation.
- `lib/scoring/*` or equivalent deterministic modules should calculate match scores without model involvement.
- `app/api/agent-runs/*` should create, read, and retry traceable agent runs.
- `app/api/import-reviews/*`, `app/api/recommendation-reviews/*`, and `app/api/assignment-reviews/*` should submit human review actions.
- `app/api/matches/*` should return deterministic scores and may attach AI explanations only after preserving score values exactly.
- Persistence should record `agent_runs`, `agent_tool_calls`, `audit_events`, review state, model metadata, prompt versions, and scoring versions.

Live AI non-goals until those boundaries exist:

- No automatic employee import from AI output.
- No AI-generated match percentage.
- No AI mutation of capacity, deadlines, source skill ratings, or assignment records.
- No hidden approval through chat or background workflow.
- No untraceable recommendation that lacks source references and an `agentRunId`.

## 1. Shared Contract Rules

### 1.1 Contract Envelope

Every agent returns a structured envelope, even when the agent partially fails.

```ts
type AgentOutputEnvelope<T> = {
  agentRunId: string;
  agentName:
    | "document_intake"
    | "skill_normalization"
    | "matching_recommendation"
    | "workforce_insights"
    | "manager_copilot";
  workflowVersion: string;
  status: "completed" | "needs_review" | "partial" | "failed" | "fallback";
  generatedAt: string;
  inputRefs: SourceRef[];
  output: T;
  warnings: AgentWarning[];
  review: ReviewCheckpoint[];
  audit: AgentAuditSummary;
};
```

```ts
type SourceRef = {
  sourceType: "upload" | "database_record" | "manager_input" | "sample_data" | "tool_result";
  sourceId: string;
  recordId?: string;
  page?: number;
  row?: number;
  column?: string;
  charRange?: { start: number; end: number };
};

type AgentWarning = {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  sourceRefs?: SourceRef[];
};

type ReviewCheckpoint = {
  checkpointId: string;
  checkpointType:
    | "confirm_import"
    | "confirm_skill_mapping"
    | "confirm_estimated_rating"
    | "confirm_recommendation"
    | "confirm_assignment"
    | "confirm_bulk_change"
    | "acknowledge_insight";
  required: boolean;
  reason: string;
  targetRefs: SourceRef[];
  allowedActions: Array<"approve" | "edit" | "reject" | "defer">;
};

type AgentAuditSummary = {
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptVersion?: string;
  toolCallCount: number;
  fallbackUsed: boolean;
  deterministicScoreUsed: boolean;
  reviewedByManager: boolean;
};
```

### 1.2 Confidence Rules

- Confidence values use `0.0` through `1.0`.
- Any field confidence below `0.75` requires manager review before import or use in matching.
- AI-estimated skill ratings always require review before becoming authoritative employee skill ratings.
- Missing required fields create `blocking` warnings for import.
- Duplicate candidates create `warning` or `blocking` warnings depending on match strength.

### 1.3 Deterministic Scoring Separation

AI outputs must not generate or alter match percentages.

The matching score comes from deterministic application code only. AI may receive a completed score breakdown and explain it, but the AI output must preserve the provided values exactly.

```ts
type DeterministicMatchScore = {
  scoreId: string;
  employeeId?: string;
  teamMemberIds?: string[];
  taskId: string;
  totalScore: number;
  label:
    | "Perfect Match"
    | "Strong Match"
    | "Good Match"
    | "Growth Match"
    | "Risky Match"
    | "Not Recommended";
  componentScores: {
    skillFit: number;
    requiredSkillCoverage: number;
    optionalSkillBonus: number;
    availability: number;
    experience: number;
    locationTimezone: number;
    urgencyDeadline: number;
    growthOpportunity: number;
    costRate?: number;
    pastPerformance?: number;
  };
  weights: Record<string, number>;
  hardConstraintResults: Array<{
    constraintId: string;
    passed: boolean;
    message: string;
  }>;
  calculatedAt: string;
  scoringVersion: string;
};
```

## 2. Shared Tool Contracts

Agents call tools through typed boundaries. Tool results are stored or referenced in `agent_runs.tool_calls`.

### 2.1 Parse Uploaded Document

```ts
type ParseUploadedDocumentInput = {
  uploadId: string;
  fileName: string;
  mimeType: string;
  parserHint?: "csv" | "excel" | "pdf" | "word" | "google_doc" | "google_sheet";
};

type ParseUploadedDocumentOutput = {
  parseId: string;
  detectedType: "employee_data" | "task_data" | "mixed" | "unknown";
  extractedText?: string;
  tables: Array<{
    tableId: string;
    headers: string[];
    rows: string[][];
    sourceRefs: SourceRef[];
  }>;
  parserWarnings: AgentWarning[];
};
```

### 2.2 Lookup Skill Taxonomy

```ts
type LookupSkillTaxonomyInput = {
  rawSkillNames: string[];
  organizationId: string;
};

type LookupSkillTaxonomyOutput = {
  matches: Array<{
    rawSkillName: string;
    normalizedSkillId?: string;
    normalizedSkillName?: string;
    matchType: "exact" | "alias" | "semantic" | "none";
    confidence: number;
  }>;
};
```

### 2.3 Run Deterministic Match Scoring

```ts
type RunMatchScoringInput = {
  employeeIds: string[];
  taskIds: string[];
  priorityWeights: Record<string, number>;
  hardConstraints: Array<{
    constraintId: string;
    type: "availability" | "location" | "minimum_skill" | "capacity" | "clearance";
    value: string | number | boolean;
  }>;
};

type RunMatchScoringOutput = {
  scoringVersion: string;
  scores: DeterministicMatchScore[];
};
```

### 2.4 Submit Manager Review

```ts
type SubmitManagerReviewInput = {
  reviewId: string;
  managerUserId: string;
  action: "approve" | "edit" | "reject" | "defer";
  editedPayload?: unknown;
  note?: string;
};

type SubmitManagerReviewOutput = {
  reviewId: string;
  status: "approved" | "edited" | "rejected" | "deferred";
  auditEventId: string;
  savedRecordIds: string[];
};
```

### 2.5 Read Workforce Snapshot

```ts
type ReadWorkforceSnapshotInput = {
  organizationId: string;
  filters?: {
    departments?: string[];
    projectIds?: string[];
    skillIds?: string[];
    dateRange?: { start: string; end: string };
  };
};

type ReadWorkforceSnapshotOutput = {
  snapshotId: string;
  employees: unknown[];
  tasks: unknown[];
  availability: unknown[];
  skillSupply: unknown[];
  skillDemand: unknown[];
  deterministicScores?: DeterministicMatchScore[];
};
```

## 3. Agent Contracts

### 3.1 Document Intake Agent

Purpose: detect uploaded document type, extract proposed employee or task records, identify missing fields, and prepare manager review.

Primary tools:

- `parseUploadedDocument`
- `lookupSkillTaxonomy`
- duplicate lookup against employees, tasks, and imports
- optional AI structured extraction from parsed text or tables

Input:

```ts
type DocumentIntakeInput = {
  organizationId: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  importMode: "employees" | "tasks" | "auto_detect";
  managerUserId: string;
};
```

Output:

```ts
type DocumentIntakeOutput = {
  detectedDocumentType: "employee_data" | "task_data" | "mixed" | "unknown";
  proposedEmployees: ProposedEmployeeRecord[];
  proposedTasks: ProposedTaskRecord[];
  duplicateCandidates: DuplicateCandidate[];
  missingFieldWarnings: AgentWarning[];
  importReadiness: "ready_for_review" | "needs_correction" | "cannot_import";
};

type ProposedEmployeeRecord = {
  temporaryRecordId: string;
  fields: {
    employeeId?: FieldValue<string>;
    name?: FieldValue<string>;
    role?: FieldValue<string>;
    department?: FieldValue<string>;
    location?: FieldValue<string>;
    timezone?: FieldValue<string>;
    capacityPercentage?: FieldValue<number>;
    skills?: FieldValue<Array<{ rawName: string; normalizedName?: string; level?: number }>>;
    certifications?: FieldValue<string[]>;
    interests?: FieldValue<string[]>;
    careerGoals?: FieldValue<string[]>;
  };
};

type ProposedTaskRecord = {
  temporaryRecordId: string;
  fields: {
    taskId?: FieldValue<string>;
    name?: FieldValue<string>;
    description?: FieldValue<string>;
    requiredSkills?: FieldValue<Array<{ rawName: string; normalizedName?: string; minimumLevel?: number; importance?: number }>>;
    optionalSkills?: FieldValue<string[]>;
    urgency?: FieldValue<"low" | "medium" | "high" | "critical">;
    deadline?: FieldValue<string>;
    estimatedHours?: FieldValue<number>;
    staffingMode?: FieldValue<"individual" | "team">;
    teamSize?: FieldValue<number>;
  };
};

type FieldValue<T> = {
  value: T;
  confidence: number;
  sourceRefs: SourceRef[];
  requiresReview: boolean;
};

type DuplicateCandidate = {
  proposedRecordId: string;
  existingRecordType: "employee" | "task" | "imported_record";
  existingRecordId: string;
  reason: string;
  confidence: number;
};
```

Review checkpoints:

- `confirm_import` for every import batch.
- `confirm_estimated_rating` for any extracted skill level not explicitly provided by source data.
- `confirm_skill_mapping` for semantic skill matches below `0.90`.
- Blocking review for missing employee name, task name, required skills, or impossible capacity values.

Safe fallback when AI is unavailable:

- CSV and Excel continue through deterministic parsing only.
- PDF, Word, Google Docs, and Google Sheets return parsed text or table previews when available, with `status: "fallback"`.
- The system does not infer missing fields or skill levels.
- The manager can manually map columns, edit fields, and submit the import through the normal review path.

### 3.2 Skill Normalization Agent

Purpose: map raw skill names to the organization taxonomy and propose skill levels only when source evidence supports it.

Primary tools:

- `lookupSkillTaxonomy`
- taxonomy alias lookup
- employee and task skill history lookup
- optional AI semantic mapping for unmatched skills

Input:

```ts
type SkillNormalizationInput = {
  organizationId: string;
  rawSkills: Array<{
    rawSkillId: string;
    rawName: string;
    contextText?: string;
    sourceRefs: SourceRef[];
    recordType: "employee" | "task";
  }>;
};
```

Output:

```ts
type SkillNormalizationOutput = {
  normalizedSkills: Array<{
    rawSkillId: string;
    rawName: string;
    normalizedSkillId?: string;
    normalizedName?: string;
    canonicalCategory?: string;
    mappingConfidence: number;
    mappingReason: string;
    suggestedLevel?: {
      value: number;
      levelLabel: "Beginner" | "Intermediate" | "Advanced" | "Expert";
      confidence: number;
      evidence: string[];
      requiresManagerApproval: true;
    };
    action: "use_existing" | "create_alias" | "create_new_skill" | "needs_review";
    sourceRefs: SourceRef[];
  }>;
};
```

Review checkpoints:

- `confirm_skill_mapping` for new taxonomy entries, new aliases, and semantic matches.
- `confirm_estimated_rating` for every suggested employee skill level.
- Manager edits write audit events with before and after values.

Safe fallback when AI is unavailable:

- Exact and alias matches still run from the taxonomy table.
- Unknown skills are preserved as raw skill names and marked `needs_review`.
- No semantic merge, new alias, or level estimate is created automatically.

### 3.3 Matching Recommendation Agent

Purpose: explain deterministic recommendations, identify risks and missing skills, and propose alternatives without changing scores.

Primary tools:

- `readWorkforceSnapshot`
- `runMatchScoring`
- skill taxonomy lookup
- availability and capacity lookup
- manager priority lookup

Input:

```ts
type MatchingRecommendationInput = {
  organizationId: string;
  managerUserId: string;
  taskIds: string[];
  employeeIds?: string[];
  staffingMode: "individual" | "team" | "both";
  priorityWeights: Record<string, number>;
  hardConstraints: RunMatchScoringInput["hardConstraints"];
};
```

Output:

```ts
type MatchingRecommendationOutput = {
  recommendations: Array<{
    recommendationId: string;
    taskId: string;
    candidateType: "employee" | "team";
    employeeIds: string[];
    score: DeterministicMatchScore;
    rank: number;
    explanation: {
      summary: string;
      coveredRequiredSkills: string[];
      missingOrWeakSkills: string[];
      availabilityWarnings: string[];
      trainingSuggestions: string[];
      staffingRisks: string[];
      alternativeCandidateIds: string[];
      recommendationBasis: "delivery" | "availability" | "growth" | "balanced";
    };
    approvalState: "not_submitted" | "pending_manager_review" | "approved" | "rejected" | "edited";
  }>;
};
```

Review checkpoints:

- `confirm_recommendation` before a recommendation is shown as manager-approved.
- `confirm_assignment` before employee-to-project assignment records are saved.
- `confirm_bulk_change` when multiple assignments or bucket moves are submitted together.

Safe fallback when AI is unavailable:

- The deterministic scoring engine still returns ranked candidates, labels, and component scores.
- Explanation text uses a templated deterministic summary from the score breakdown.
- No AI-generated training suggestion or nuanced risk summary is shown unless it can be derived from structured data.
- Assignment still requires manager approval.

### 3.4 Workforce Insights Agent

Purpose: summarize capacity, skill supply and demand, project risk, and underused talent for dashboard and drill-down workflows.

Primary tools:

- `readWorkforceSnapshot`
- deterministic aggregation queries
- deterministic match scoring results
- skill taxonomy lookup

Input:

```ts
type WorkforceInsightsInput = {
  organizationId: string;
  managerUserId: string;
  snapshotScope: "dashboard" | "department" | "project" | "skill";
  filters?: ReadWorkforceSnapshotInput["filters"];
};
```

Output:

```ts
type WorkforceInsightsOutput = {
  snapshotId: string;
  insights: Array<{
    insightId: string;
    type:
      | "skill_shortage"
      | "overload_risk"
      | "underutilized_employee"
      | "project_staffing_risk"
      | "training_opportunity"
      | "hiring_signal";
    severity: "info" | "watch" | "risk" | "critical";
    headline: string;
    explanation: string;
    supportingMetrics: Array<{
      metricName: string;
      value: number | string;
      calculationSource: "deterministic_query" | "deterministic_score";
    }>;
    relatedEmployeeIds: string[];
    relatedTaskIds: string[];
    relatedSkillIds: string[];
    recommendedActions: string[];
    confidence: number;
  }>;
};
```

Review checkpoints:

- `acknowledge_insight` for critical staffing risks before they are marked reviewed.
- No insight directly changes assignments, skills, capacity, or project status.
- Any recommended action that changes records routes to the relevant import, skill, or assignment review checkpoint.

Safe fallback when AI is unavailable:

- Dashboard KPIs, charts, and deterministic thresholds still render.
- Insight cards use templated deterministic alerts such as scarce skills, high utilization, and low coverage.
- The system marks generated insight text as `fallback` in `agent_runs`.

### 3.5 Manager Copilot Agent

Purpose: answer manager questions by reading approved data, calling deterministic tools, and returning traceable responses with next actions.

Primary tools:

- `readWorkforceSnapshot`
- `runMatchScoring`
- lookup employees, tasks, assignments, skills, and prior recommendations
- `submitManagerReview` only after explicit manager confirmation

Input:

```ts
type ManagerCopilotInput = {
  organizationId: string;
  managerUserId: string;
  conversationId: string;
  messageId: string;
  userQuestion: string;
  allowedActions: Array<"read" | "recommend" | "draft_review" | "submit_review">;
  contextRefs?: SourceRef[];
};
```

Output:

```ts
type ManagerCopilotOutput = {
  answer: {
    summary: string;
    details: string[];
    citedRefs: SourceRef[];
    confidence: number;
  };
  toolResultsUsed: Array<{
    toolCallId: string;
    toolName: string;
    resultRef: string;
  }>;
  recommendations?: MatchingRecommendationOutput["recommendations"];
  proposedActions: Array<{
    actionId: string;
    actionType:
      | "open_employee"
      | "open_task"
      | "run_matching"
      | "draft_assignment_review"
      | "draft_import_review"
      | "show_insight_drilldown";
    label: string;
    requiresManagerConfirmation: boolean;
    targetRefs: SourceRef[];
  }>;
  refusal?: {
    reason: "insufficient_permissions" | "missing_data" | "unsafe_action" | "out_of_scope";
    message: string;
  };
};
```

Review checkpoints:

- The copilot may draft review submissions, but cannot approve imports, skill ratings, or assignments without an explicit manager confirmation action.
- Any answer that depends on unapproved imported data must disclose that status.
- Permission failures return a refusal instead of hidden partial data.

Safe fallback when AI is unavailable:

- Natural-language chat pauses with a clear unavailable message.
- The UI can still offer deterministic actions: open Matching, run scoring with selected priorities, open Employees, open Tasks, and open Import Review.
- No conversational answer is persisted as an AI recommendation when no model response exists.

## 4. Persistence Contracts

### 4.1 `agent_runs`

`agent_runs` stores one row per agent invocation.

```ts
type AgentRunRecord = {
  id: string;
  organizationId: string;
  agentName: AgentOutputEnvelope<unknown>["agentName"];
  workflowVersion: string;
  status: AgentOutputEnvelope<unknown>["status"];
  startedAt: string;
  completedAt?: string;
  triggeredByUserId?: string;
  triggerType: "upload" | "manual_request" | "scheduled_insight" | "system_retry";
  inputHash: string;
  inputSummary: string;
  outputRef?: string;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptVersion?: string;
  tokenInputCount?: number;
  tokenOutputCount?: number;
  toolCallCount: number;
  fallbackUsed: boolean;
  errorCode?: string;
  errorMessage?: string;
};
```

### 4.2 `agent_tool_calls`

```ts
type AgentToolCallRecord = {
  id: string;
  agentRunId: string;
  toolName: string;
  startedAt: string;
  completedAt?: string;
  status: "completed" | "failed" | "skipped";
  inputHash: string;
  outputRef?: string;
  errorCode?: string;
  errorMessage?: string;
};
```

### 4.3 `audit_events`

`audit_events` records human and system decisions that affect durable state.

```ts
type AuditEventRecord = {
  id: string;
  organizationId: string;
  actorType: "manager" | "agent" | "system";
  actorId: string;
  eventType:
    | "agent_run_started"
    | "agent_run_completed"
    | "import_review_submitted"
    | "skill_mapping_review_submitted"
    | "skill_rating_review_submitted"
    | "recommendation_review_submitted"
    | "assignment_review_submitted"
    | "manager_override_submitted"
    | "fallback_used";
  targetType: "agent_run" | "employee" | "task" | "skill" | "match" | "assignment" | "import";
  targetId: string;
  beforeRef?: string;
  afterRef?: string;
  agentRunId?: string;
  managerUserId?: string;
  reason?: string;
  createdAt: string;
};
```

## 5. Fallback Behavior Matrix

| Agent | AI unavailable behavior | Durable writes allowed |
| --- | --- | --- |
| Document Intake | Parse CSV/Excel deterministically; show manual review for other parsed text/tables | Only manager-approved imports |
| Skill Normalization | Use exact and alias taxonomy matches; mark unknowns for review | Only manager-approved mappings or ratings |
| Matching Recommendation | Return deterministic ranked scores and templated explanations | Only manager-approved assignments |
| Workforce Insights | Show deterministic KPI and threshold alerts | No direct data mutation |
| Manager Copilot | Pause chat answer; expose deterministic navigation and scoring actions | Only explicit manager review submissions |

## 6. Implementation Notes

- Validate all agent outputs with Zod before showing or storing them.
- Store raw uploaded files separately from extracted structured records.
- Store large model outputs by reference when needed, but keep review status and audit metadata queryable.
- Never use AI text as the source of truth for employee capacity, task deadlines, match score percentages, or assignment approval.
- Include `workflowVersion`, `promptVersion`, and `scoringVersion` in logs so future recommendation changes are explainable.
- The initial demo can implement these contracts as TypeScript types or documentation first; production should enforce them at API and database boundaries.

