import type {
  AgentName,
  AgentRunInsert,
  AgentRunStatus,
  AgentTriggerType,
  AssignmentInsert,
  AssignmentSource,
  AuditEventInsert,
  ImportedRecordReviewStatus,
  ImportInsert,
  ImportSourceType,
  SourceRef,
  WorkMatchSettings,
} from './schema';
import type { ImportTarget, MatchLabel } from '../types';

export const DEFAULT_ORGANIZATION_SETTINGS: Required<WorkMatchSettings> = {
  aiProvider: 'environment',
  defaultPriority: 'skillFit',
  priorityWeights: {
    skillFit: 1,
    availability: 1,
    experience: 1,
    location: 1,
    urgency: 1,
    growth: 1,
  },
  importConfidenceThreshold: 0.75,
  requireManagerReview: true,
  auditVisibility: 'managers',
  enabledDataSources: {
    csv: true,
    excel: true,
    pdf: true,
    word: true,
    microsoft365: false,
    roster: true,
    manual: true,
  },
  agentFallbackMode: 'deterministic_only',
};

export const REVIEW_GATED_RECORD_STATUSES: ImportedRecordReviewStatus[] = [
  'needs_review',
  'needs_correction',
  'deferred',
];

export function requiresManagerReview(settings: Pick<WorkMatchSettings, 'requireManagerReview'> | undefined): boolean {
  return settings?.requireManagerReview ?? DEFAULT_ORGANIZATION_SETTINGS.requireManagerReview;
}

export function isImportedRecordApproved(status: ImportedRecordReviewStatus): boolean {
  return status === 'confirmed';
}

export function isImportedRecordBlocked(status: ImportedRecordReviewStatus): boolean {
  return status === 'rejected' || REVIEW_GATED_RECORD_STATUSES.includes(status);
}

export function createImportContract(input: {
  organizationId: string;
  sourceType: ImportSourceType;
  sourceName: string;
  target: ImportTarget;
  triggeredByUserId?: string;
  agentRunId?: string;
  confidenceThreshold?: number;
}): ImportInsert {
  return {
    organization_id: input.organizationId,
    source_type: input.sourceType,
    source_name: input.sourceName,
    target: input.target,
    status: 'uploaded',
    review_required: true,
    confidence_threshold: input.confidenceThreshold ?? DEFAULT_ORGANIZATION_SETTINGS.importConfidenceThreshold,
    triggered_by_user_id: input.triggeredByUserId ?? null,
    agent_run_id: input.agentRunId ?? null,
    row_count: 0,
    confirmed_count: 0,
    rejected_count: 0,
  };
}

export function createAgentRunContract(input: {
  organizationId: string;
  agentName: AgentName;
  workflowVersion: string;
  triggerType: AgentTriggerType;
  inputHash: string;
  inputSummary: string;
  triggeredByUserId?: string;
  status?: AgentRunStatus;
  startedAt?: string;
  deterministicScoreUsed?: boolean;
}): AgentRunInsert {
  return {
    organization_id: input.organizationId,
    agent_name: input.agentName,
    workflow_version: input.workflowVersion,
    status: input.status ?? 'queued',
    started_at: input.startedAt ?? new Date().toISOString(),
    triggered_by_user_id: input.triggeredByUserId ?? null,
    trigger_type: input.triggerType,
    input_hash: input.inputHash,
    input_summary: input.inputSummary,
    tool_call_count: 0,
    fallback_used: false,
    deterministic_score_used: input.deterministicScoreUsed ?? false,
  };
}

export function createAssignmentReviewContract(input: {
  organizationId: string;
  taskId: string;
  employeeId: string;
  source: AssignmentSource;
  allocationPercent?: number;
  matchScore?: number;
  matchLabel?: MatchLabel;
  importId?: string;
  importedRecordId?: string;
  agentRunId?: string;
  createdByUserId?: string;
  sourceRefs?: SourceRef[];
}): AssignmentInsert {
  return {
    organization_id: input.organizationId,
    task_id: input.taskId,
    employee_id: input.employeeId,
    status: 'pending_review',
    source: input.source,
    allocation_percent: input.allocationPercent ?? 100,
    match_score: input.matchScore ?? null,
    match_label: input.matchLabel ?? null,
    import_id: input.importId ?? null,
    imported_record_id: input.importedRecordId ?? null,
    agent_run_id: input.agentRunId ?? null,
    created_by_user_id: input.createdByUserId ?? null,
    notes: input.sourceRefs?.length ? `Source refs: ${input.sourceRefs.length}` : null,
  };
}

export type ReviewablePersistenceWrite =
  | {
      targetType: 'imported_record';
      status: ImportedRecordReviewStatus;
    }
  | {
      targetType: 'assignment';
      status: AssignmentInsert['status'];
    }
  | {
      targetType: 'settings';
      status: 'pending_review' | 'approved';
    };

export function canCommitAuthoritativeWrite(write: ReviewablePersistenceWrite): boolean {
  if (write.targetType === 'imported_record') return write.status === 'confirmed';
  if (write.targetType === 'assignment') return write.status === 'approved' || write.status === 'active';
  return write.status === 'approved';
}

export type PersistenceWriteResult = {
  savedRecordIds: string[];
  auditEvents: AuditEventInsert[];
};
