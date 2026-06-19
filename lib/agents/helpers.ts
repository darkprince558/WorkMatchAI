import {
  AGENT_WORKFLOW_VERSION,
  AgentAuditSummary,
  AgentName,
  AgentOutputEnvelope,
  AgentStatus,
  AgentWarning,
  DeterministicMatchScore,
  FieldValue,
  MatchExplanationModelOutput,
  MatchExplanationOutput,
  ReviewCheckpoint,
  SourceRef,
} from './contracts';

export const DEFAULT_CONFIDENCE_REVIEW_THRESHOLD = 0.75;

export type AgentValidationResult<TValue> =
  | {
      ok: true;
      value: TValue;
      warnings: AgentWarning[];
    }
  | {
      ok: false;
      issues: string[];
      warnings: AgentWarning[];
    };

export interface CreateAgentEnvelopeOptions<TOutput> {
  agentName: AgentName;
  output: TOutput;
  inputRefs?: SourceRef[];
  status?: AgentStatus;
  agentRunId?: string;
  generatedAt?: string;
  warnings?: AgentWarning[];
  review?: ReviewCheckpoint[];
  audit?: Partial<AgentAuditSummary>;
}

export interface AgentModelMetadata {
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptVersion?: string;
}

export function createAgentRunId(agentName: AgentName, date = new Date()) {
  const timestamp = date.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${agentName}-${timestamp}-${suffix}`;
}

export function createAgentEnvelope<TOutput>({
  agentName,
  output,
  inputRefs = [],
  status = 'completed',
  agentRunId = createAgentRunId(agentName),
  generatedAt = new Date().toISOString(),
  warnings = [],
  review = [],
  audit = {},
}: CreateAgentEnvelopeOptions<TOutput>): AgentOutputEnvelope<TOutput> {
  return {
    agentRunId,
    agentName,
    workflowVersion: AGENT_WORKFLOW_VERSION,
    status,
    generatedAt,
    inputRefs,
    output,
    warnings,
    review,
    audit: {
      toolCallCount: audit.toolCallCount ?? 0,
      fallbackUsed: audit.fallbackUsed ?? status === 'fallback',
      deterministicScoreUsed: audit.deterministicScoreUsed ?? agentName === 'match_explanation',
      reviewedByManager: audit.reviewedByManager ?? false,
      modelProvider: audit.modelProvider,
      modelName: audit.modelName,
      modelVersion: audit.modelVersion,
      promptVersion: audit.promptVersion,
    },
  };
}

export function createFallbackEnvelope<TOutput>(
  options: Omit<CreateAgentEnvelopeOptions<TOutput>, 'status' | 'warnings'> & {
    fallbackCode: string;
    fallbackMessage: string;
    warnings?: AgentWarning[];
  }
): AgentOutputEnvelope<TOutput> {
  const { fallbackCode, fallbackMessage, warnings = [], ...envelopeOptions } = options;
  const fallbackWarning: AgentWarning = {
    code: fallbackCode,
    severity: 'warning',
    message: fallbackMessage,
    sourceRefs: envelopeOptions.inputRefs,
  };

  return createAgentEnvelope({
    ...envelopeOptions,
    status: 'fallback',
    warnings: [fallbackWarning, ...warnings],
    audit: {
      ...envelopeOptions.audit,
      fallbackUsed: true,
    },
  });
}

export function requiresManagerReview(confidence: number, threshold = DEFAULT_CONFIDENCE_REVIEW_THRESHOLD) {
  return confidence < threshold;
}

export function withReviewRequirement<TValue>(
  field: Omit<FieldValue<TValue>, 'requiresReview'>,
  threshold = DEFAULT_CONFIDENCE_REVIEW_THRESHOLD
): FieldValue<TValue> {
  return {
    ...field,
    requiresReview: requiresManagerReview(field.confidence, threshold),
  };
}

export function createReviewCheckpoint(
  checkpointType: ReviewCheckpoint['checkpointType'],
  reason: string,
  targetRefs: SourceRef[],
  required = true,
  allowedActions: ReviewCheckpoint['allowedActions'] = ['approve', 'edit', 'reject', 'defer']
): ReviewCheckpoint {
  return {
    checkpointId: `${checkpointType}-${targetRefs[0]?.sourceId ?? 'manual'}-${Math.random().toString(36).slice(2, 8)}`,
    checkpointType,
    required,
    reason,
    targetRefs,
    allowedActions,
  };
}

export function parseModelJson(raw: string): AgentValidationResult<unknown> {
  try {
    return {
      ok: true,
      value: JSON.parse(raw) as unknown,
      warnings: [],
    };
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : 'Model response was not valid JSON.'],
      warnings: [
        {
          code: 'MODEL_JSON_PARSE_FAILED',
          severity: 'blocking',
          message: 'The model response could not be parsed as JSON.',
        },
      ],
    };
  }
}

export function validateAgentEnvelope<TOutput>(value: AgentOutputEnvelope<TOutput>): AgentValidationResult<AgentOutputEnvelope<TOutput>> {
  const issues: string[] = [];

  if (!value.agentRunId) issues.push('Missing agentRunId.');
  if (!value.agentName) issues.push('Missing agentName.');
  if (!value.workflowVersion) issues.push('Missing workflowVersion.');
  if (!value.generatedAt) issues.push('Missing generatedAt.');
  if (!Array.isArray(value.inputRefs)) issues.push('inputRefs must be an array.');
  if (!Array.isArray(value.warnings)) issues.push('warnings must be an array.');
  if (!Array.isArray(value.review)) issues.push('review must be an array.');
  if (value.audit.deterministicScoreUsed && value.agentName !== 'match_explanation' && value.agentName !== 'manager_copilot') {
    issues.push('deterministicScoreUsed should only be true for explanation or copilot outputs that cite deterministic scores.');
  }

  if (issues.length) {
    return {
      ok: false,
      issues,
      warnings: [
        {
          code: 'AGENT_ENVELOPE_INVALID',
          severity: 'blocking',
          message: issues.join(' '),
        },
      ],
    };
  }

  return {
    ok: true,
    value,
    warnings: value.warnings,
  };
}

export function createMatchExplanationOutput(
  deterministicScore: DeterministicMatchScore,
  candidateEmployeeIds: string[],
  explanation: MatchExplanationModelOutput
): MatchExplanationOutput {
  return {
    taskId: deterministicScore.taskId,
    candidateEmployeeIds,
    deterministicScore,
    explanation,
    scoreIntegrity: {
      deterministicScoreId: deterministicScore.scoreId,
      preservesInputScore: true,
      modelGeneratedPercentage: false,
    },
  };
}

export function validateMatchExplanationScoreIntegrity(
  expectedScore: DeterministicMatchScore,
  output: MatchExplanationOutput
): AgentValidationResult<MatchExplanationOutput> {
  const issues: string[] = [];

  if (output.deterministicScore.scoreId !== expectedScore.scoreId) issues.push('Score ID changed.');
  if (output.deterministicScore.taskId !== expectedScore.taskId) issues.push('Task ID changed.');
  if (output.deterministicScore.totalScore !== expectedScore.totalScore) issues.push('Total score changed.');
  if (output.deterministicScore.label !== expectedScore.label) issues.push('Score label changed.');
  if (!output.scoreIntegrity.preservesInputScore) issues.push('Score integrity flag must preserve the input score.');
  if (output.scoreIntegrity.modelGeneratedPercentage) issues.push('Model output must not generate a match percentage.');

  if (issues.length) {
    return {
      ok: false,
      issues,
      warnings: [
        {
          code: 'MATCH_SCORE_INTEGRITY_FAILED',
          severity: 'blocking',
          message: issues.join(' '),
          sourceRefs: [{ sourceType: 'deterministic_score', sourceId: expectedScore.scoreId, recordId: expectedScore.taskId }],
        },
      ],
    };
  }

  return {
    ok: true,
    value: output,
    warnings: [],
  };
}

export function createLowConfidenceWarning(sourceRefs: SourceRef[], message: string): AgentWarning {
  return {
    code: 'LOW_CONFIDENCE_REQUIRES_REVIEW',
    severity: 'warning',
    message,
    sourceRefs,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
