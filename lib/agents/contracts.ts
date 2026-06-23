import type { Employee, ManagerPriorityWeights, Task } from '../types';

export const AGENT_WORKFLOW_VERSION = 'workmatch-ai-routes-v1';

export type AgentName =
  | 'document_extraction_assistance'
  | 'skill_normalization'
  | 'employee_summary'
  | 'task_summary'
  | 'match_explanation'
  | 'dashboard_insights'
  | 'manager_copilot';

export type AgentStatus = 'completed' | 'needs_review' | 'partial' | 'failed' | 'fallback';

export type SourceType = 'upload' | 'database_record' | 'manager_input' | 'sample_data' | 'tool_result' | 'deterministic_score';

export interface SourceRef {
  sourceType: SourceType;
  sourceId: string;
  recordId?: string;
  page?: number;
  row?: number;
  column?: string;
  charRange?: {
    start: number;
    end: number;
  };
}

export const READ_ONLY_AGENT_TOOL_NAMES = [
  'search_employees',
  'search_tasks',
  'score_matches',
  'list_recent_imports',
  'lookup_document_chunks',
] as const;

export type ReadOnlyAgentToolName = (typeof READ_ONLY_AGENT_TOOL_NAMES)[number];

export interface AgentToolResult<TOutput = unknown> {
  toolCallId: string;
  toolName: ReadOnlyAgentToolName;
  resultRef: string;
  sourceRefs: SourceRef[];
  output: TOutput;
}

export type AgentWarningSeverity = 'info' | 'warning' | 'blocking';

export interface AgentWarning {
  code: string;
  severity: AgentWarningSeverity;
  message: string;
  sourceRefs?: SourceRef[];
}

export type ReviewCheckpointType =
  | 'confirm_import'
  | 'confirm_skill_mapping'
  | 'confirm_estimated_rating'
  | 'confirm_recommendation'
  | 'confirm_assignment'
  | 'confirm_bulk_change'
  | 'acknowledge_insight';

export type ReviewAction = 'approve' | 'edit' | 'reject' | 'defer';

export interface ReviewCheckpoint {
  checkpointId: string;
  checkpointType: ReviewCheckpointType;
  required: boolean;
  reason: string;
  targetRefs: SourceRef[];
  allowedActions: ReviewAction[];
}

export interface AgentAuditSummary {
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptVersion?: string;
  toolCallCount: number;
  fallbackUsed: boolean;
  deterministicScoreUsed: boolean;
  reviewedByManager: boolean;
}

export interface AgentOutputEnvelope<TOutput> {
  agentRunId: string;
  agentName: AgentName;
  workflowVersion: string;
  status: AgentStatus;
  generatedAt: string;
  inputRefs: SourceRef[];
  output: TOutput;
  warnings: AgentWarning[];
  review: ReviewCheckpoint[];
  audit: AgentAuditSummary;
}

export interface FieldValue<TValue> {
  value: TValue;
  confidence: number;
  sourceRefs: SourceRef[];
  requiresReview: boolean;
}

export type ImportMode = 'employees' | 'tasks' | 'auto_detect';
export type DetectedDocumentType = 'employee_data' | 'task_data' | 'mixed' | 'unknown';
export type ImportReadiness = 'ready_for_review' | 'needs_correction' | 'cannot_import';

export interface ParsedDocumentTable {
  tableId: string;
  headers: string[];
  rows: string[][];
  sourceRefs: SourceRef[];
}

export interface ParsedDocumentPreview {
  parseId: string;
  detectedType: DetectedDocumentType;
  extractedText?: string;
  tables: ParsedDocumentTable[];
  parserWarnings: AgentWarning[];
}

export interface DocumentExtractionAssistanceInput {
  organizationId: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  importMode: ImportMode;
  managerUserId: string;
  parserOutput?: ParsedDocumentPreview;
  extractionGoal?: string;
}

export interface ExtractedSkillValue {
  rawName: string;
  normalizedName?: string;
  level?: number;
  levelWasExplicit?: boolean;
}

export interface ExtractedSkillRequirementValue {
  rawName: string;
  normalizedName?: string;
  minimumLevel?: number;
  importance?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ProposedEmployeeRecord {
  temporaryRecordId: string;
  fields: {
    employeeId?: FieldValue<string>;
    name?: FieldValue<string>;
    role?: FieldValue<string>;
    department?: FieldValue<string>;
    location?: FieldValue<string>;
    timezone?: FieldValue<string>;
    capacityPercentage?: FieldValue<number>;
    yearsExperience?: FieldValue<number>;
    skills?: FieldValue<ExtractedSkillValue[]>;
    certifications?: FieldValue<string[]>;
    interests?: FieldValue<string[]>;
    careerGoals?: FieldValue<string>;
    pastProjects?: FieldValue<string[]>;
  };
}

export interface ProposedTaskRecord {
  temporaryRecordId: string;
  fields: {
    taskId?: FieldValue<string>;
    name?: FieldValue<string>;
    description?: FieldValue<string>;
    requiredSkills?: FieldValue<ExtractedSkillRequirementValue[]>;
    optionalSkills?: FieldValue<string[]>;
    urgency?: FieldValue<'low' | 'medium' | 'high' | 'critical'>;
    deadline?: FieldValue<string>;
    estimatedHours?: FieldValue<number>;
    staffingMode?: FieldValue<'individual' | 'team'>;
    teamSize?: FieldValue<number>;
  };
}

export interface DuplicateCandidate {
  proposedRecordId: string;
  existingRecordType: 'employee' | 'task' | 'imported_record';
  existingRecordId: string;
  reason: string;
  confidence: number;
}

export interface DocumentExtractionAssistanceOutput {
  detectedDocumentType: DetectedDocumentType;
  proposedEmployees: ProposedEmployeeRecord[];
  proposedTasks: ProposedTaskRecord[];
  duplicateCandidates: DuplicateCandidate[];
  missingFieldWarnings: AgentWarning[];
  importReadiness: ImportReadiness;
  extractionNotes: string[];
}

export interface SkillNormalizationInput {
  organizationId: string;
  rawSkills: Array<{
    rawSkillId: string;
    rawName: string;
    contextText?: string;
    sourceRefs: SourceRef[];
    recordType: 'employee' | 'task';
  }>;
}

export interface NormalizedSkillProposal {
  rawSkillId: string;
  rawName: string;
  normalizedSkillId?: string;
  normalizedName?: string;
  canonicalCategory?: string;
  mappingConfidence: number;
  mappingReason: string;
  suggestedLevel?: {
    value: number;
    levelLabel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
    confidence: number;
    evidence: string[];
    requiresManagerApproval: true;
  };
  action: 'use_existing' | 'create_alias' | 'create_new_skill' | 'needs_review';
  sourceRefs: SourceRef[];
}

export interface SkillNormalizationOutput {
  normalizedSkills: NormalizedSkillProposal[];
}

export interface EmployeeSummaryInput {
  organizationId: string;
  employee: Employee;
  relatedTasks?: Task[];
  deterministicScores?: DeterministicMatchScore[];
  managerQuestion?: string;
}

export interface EmployeeSummaryOutput {
  employeeId: string;
  headline: string;
  strengths: string[];
  capacitySummary: string;
  growthOpportunities: string[];
  staffingRisks: string[];
  recommendedNextActions: string[];
  citedRefs: SourceRef[];
  confidence: number;
}

export interface TaskSummaryInput {
  organizationId: string;
  task: Task;
  candidateEmployees?: Employee[];
  deterministicScores?: DeterministicMatchScore[];
  managerQuestion?: string;
}

export interface TaskSummaryOutput {
  taskId: string;
  headline: string;
  deliveryNeed: string;
  requiredCoverageSummary: string;
  staffingRisks: string[];
  recommendedNextActions: string[];
  citedRefs: SourceRef[];
  confidence: number;
}

export type AgentMatchLabel =
  | 'Perfect Match'
  | 'Strong Match'
  | 'Good Match'
  | 'Growth Match'
  | 'Risky Match'
  | 'Not Recommended';

export interface DeterministicMatchScore {
  scoreId: string;
  employeeId?: string;
  teamMemberIds?: string[];
  taskId: string;
  totalScore: number;
  label: AgentMatchLabel;
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
}

export interface MatchExplanationInput {
  organizationId: string;
  managerUserId: string;
  task: Task;
  candidateEmployees: Employee[];
  deterministicScore: DeterministicMatchScore;
  managerPriorities?: ManagerPriorityWeights;
  alternativeScores?: DeterministicMatchScore[];
}

export interface MatchExplanationModelOutput {
  summary: string;
  coveredRequiredSkills: string[];
  missingOrWeakSkills: string[];
  availabilityWarnings: string[];
  trainingSuggestions: string[];
  staffingRisks: string[];
  alternativeCandidateIds: string[];
  recommendationBasis: 'delivery' | 'availability' | 'growth' | 'balanced';
  citedRefs: SourceRef[];
  confidence: number;
}

export interface MatchExplanationOutput {
  taskId: string;
  candidateEmployeeIds: string[];
  deterministicScore: DeterministicMatchScore;
  explanation: MatchExplanationModelOutput;
  scoreIntegrity: {
    deterministicScoreId: string;
    preservesInputScore: true;
    modelGeneratedPercentage: false;
  };
}

export interface WorkforceSnapshotMetric {
  metricName: string;
  value: number | string;
  calculationSource: 'deterministic_query' | 'deterministic_score';
}

export interface DashboardInsightsInput {
  organizationId: string;
  managerUserId: string;
  snapshotScope: 'dashboard' | 'department' | 'project' | 'skill';
  snapshotId: string;
  metrics: WorkforceSnapshotMetric[];
  employees?: Employee[];
  tasks?: Task[];
  deterministicScores?: DeterministicMatchScore[];
  filters?: {
    departments?: string[];
    projectIds?: string[];
    skillIds?: string[];
    dateRange?: { start: string; end: string };
  };
}

export interface DashboardInsight {
  insightId: string;
  type:
    | 'skill_shortage'
    | 'overload_risk'
    | 'underutilized_employee'
    | 'project_staffing_risk'
    | 'training_opportunity'
    | 'hiring_signal';
  severity: 'info' | 'watch' | 'risk' | 'critical';
  headline: string;
  explanation: string;
  supportingMetrics: WorkforceSnapshotMetric[];
  relatedEmployeeIds: string[];
  relatedTaskIds: string[];
  relatedSkillIds: string[];
  recommendedActions: string[];
  confidence: number;
}

export interface DashboardInsightsOutput {
  snapshotId: string;
  insights: DashboardInsight[];
}

export interface ManagerCopilotInput {
  organizationId: string;
  managerUserId: string;
  conversationId: string;
  messageId: string;
  userQuestion: string;
  allowedActions: Array<'read' | 'recommend' | 'draft_review' | 'submit_review'>;
  contextRefs?: SourceRef[];
  toolResults?: AgentToolResult[];
  deterministicScores?: DeterministicMatchScore[];
}

export interface ManagerCopilotOutput {
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
  recommendations?: MatchExplanationOutput[];
  proposedActions: Array<{
    actionId: string;
    actionType:
      | 'open_employee'
      | 'open_task'
      | 'run_matching'
      | 'draft_assignment_review'
      | 'draft_import_review'
      | 'show_insight_drilldown';
    label: string;
    requiresManagerConfirmation: boolean;
    targetRefs: SourceRef[];
  }>;
  refusal?: {
    reason: 'insufficient_permissions' | 'missing_data' | 'unsafe_action' | 'out_of_scope';
    message: string;
  };
}

export interface AgentToolCallRecord {
  id: string;
  agentRunId: string;
  toolName: string;
  startedAt: string;
  completedAt?: string;
  status: 'completed' | 'failed' | 'skipped';
  inputHash: string;
  outputRef?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AgentRunRecord {
  id: string;
  organizationId: string;
  agentName: AgentName;
  workflowVersion: string;
  status: AgentStatus;
  startedAt: string;
  completedAt?: string;
  triggeredByUserId?: string;
  triggerType: 'upload' | 'manual_request' | 'scheduled_insight' | 'system_retry';
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
}
