import type {
  AgentName,
  AgentOutputEnvelope,
  AgentStatus,
  AgentToolResult,
  AgentWarning,
  DashboardInsightsInput,
  DocumentExtractionAssistanceInput,
  EmployeeSummaryInput,
  ManagerCopilotInput,
  MatchExplanationInput,
  ReviewCheckpoint,
  SkillNormalizationInput,
  SourceRef,
  TaskSummaryInput,
} from './contracts';
import {
  buildDashboardInsightsFallback,
  buildDocumentExtractionFallback,
  buildEmployeeSummaryFallback,
  buildManagerCopilotFallback,
  buildMatchExplanationFallback,
  buildSkillNormalizationFallback,
  buildTaskSummaryFallback,
} from './fallbacks';
import {
  createAgentEnvelope,
  createFallbackEnvelope,
  createLowConfidenceWarning,
  createMatchExplanationOutput,
  createReviewCheckpoint,
  validateMatchExplanationScoreIntegrity,
} from './helpers';
import { createAgentModelClient, type AiProvider } from './model-clients';
import {
  buildDashboardInsightsRequest,
  buildDocumentExtractionAssistanceRequest,
  buildEmployeeSummaryRequest,
  buildManagerCopilotRequest,
  buildMatchExplanationRequest,
  buildSkillNormalizationRequest,
  buildTaskSummaryRequest,
  generateStructuredAgentOutput,
  type AgentModelRequest,
} from './requests';
import { validateStructuredOutput } from './validation';
import { hashAgentInput, saveAgentRunLog, summarizeAgentInput, summarizeAgentOutput } from '../db/agent-run-store';

export const runnableAgentNames: AgentName[] = [
  'document_extraction_assistance',
  'skill_normalization',
  'employee_summary',
  'task_summary',
  'match_explanation',
  'dashboard_insights',
  'manager_copilot',
];

export interface RunAgentOptions {
  triggeredByUserId?: string;
  organizationId?: string;
  aiProvider?: AiProvider | 'environment';
}

export function isRunnableAgentName(value: string): value is AgentName {
  return runnableAgentNames.includes(value as AgentName);
}

export async function runWorkMatchAgent(
  agentName: AgentName,
  input: unknown,
  options: RunAgentOptions = {}
): Promise<AgentOutputEnvelope<unknown>> {
  const startedAt = new Date().toISOString();
  const client = createAgentModelClient({ provider: options.aiProvider });
  const request = buildRequest(agentName, input);
  const organizationId = resolveOrganizationId(input, options.organizationId);
  const toolCallCount = countInputToolResults(agentName, input);
  const deterministicScoreUsed = inputUsesDeterministicScores(agentName, input);

  if (!client.configured) {
    const envelope = createFallback(agentName, input, {
      message: `${apiKeyEnvName(client.provider)} is not configured, so WorkMatch returned deterministic fallback output.`,
      code: `${client.provider.toUpperCase()}_API_KEY_MISSING`,
      modelProvider: client.provider,
      modelName: client.model,
      promptVersion: request.promptVersion,
      toolCallCount,
    });
    await logRun(envelope, input, startedAt, organizationId, options.triggeredByUserId);
    return envelope;
  }

  try {
    const generated = await generateStructuredAgentOutput(client, request);
    if (!generated.ok) {
      throw new AgentOutputError(generated.issues.join(' '), generated.warnings);
    }

    const validated = validateStructuredOutput(agentName, generated.value);
    if (!validated.ok) {
      throw new AgentOutputError(validated.issues.join(' '), validated.warnings);
    }

    const output = finalizeOutput(agentName, input, validated.value);
    const integrity = agentName === 'match_explanation' ? validateMatchExplanationScoreIntegrity((input as MatchExplanationInput).deterministicScore, output as never) : undefined;
    if (integrity && !integrity.ok) {
      throw new AgentOutputError(integrity.issues.join(' '), integrity.warnings);
    }

    const review = buildReviewCheckpoints(agentName, output);
    const warnings = buildWarnings(agentName, output);
    const status: AgentStatus = review.some((checkpoint) => checkpoint.required) ? 'needs_review' : 'completed';
    const envelope = createAgentEnvelope({
      agentName,
      output,
      inputRefs: buildInputRefs(agentName, input),
      status,
      warnings,
      review,
      audit: {
        modelProvider: client.provider,
        modelName: client.model,
        modelVersion: client.lastModelVersion,
        promptVersion: request.promptVersion,
        fallbackUsed: false,
        deterministicScoreUsed,
        toolCallCount,
      },
    });

    await logRun(envelope, input, startedAt, organizationId, options.triggeredByUserId, {
      tokenInputCount: client.lastUsage?.inputTokens,
      tokenOutputCount: client.lastUsage?.outputTokens,
    });

    return envelope;
  } catch (error) {
    const envelope = createFallback(agentName, input, {
      message: error instanceof Error ? error.message : 'The model-backed agent failed and returned deterministic fallback output.',
      code: 'AGENT_MODEL_RUN_FAILED',
      modelProvider: client.provider,
      modelName: client.model,
      modelVersion: client.lastModelVersion,
      promptVersion: request.promptVersion,
      warnings: error instanceof AgentOutputError ? error.warnings : undefined,
      toolCallCount,
    });
    await logRun(envelope, input, startedAt, organizationId, options.triggeredByUserId, {
      errorCode: 'AGENT_MODEL_RUN_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Unknown agent error.',
      tokenInputCount: client.lastUsage?.inputTokens,
      tokenOutputCount: client.lastUsage?.outputTokens,
    });
    return envelope;
  }
}

class AgentOutputError extends Error {
  constructor(message: string, readonly warnings: AgentWarning[]) {
    super(message);
  }
}

function buildRequest(agentName: AgentName, input: unknown): AgentModelRequest<unknown> {
  switch (agentName) {
    case 'document_extraction_assistance':
      return buildDocumentExtractionAssistanceRequest(input as DocumentExtractionAssistanceInput);
    case 'skill_normalization':
      return buildSkillNormalizationRequest(input as SkillNormalizationInput);
    case 'employee_summary':
      return buildEmployeeSummaryRequest(input as EmployeeSummaryInput);
    case 'task_summary':
      return buildTaskSummaryRequest(input as TaskSummaryInput);
    case 'match_explanation':
      return buildMatchExplanationRequest(input as MatchExplanationInput);
    case 'dashboard_insights':
      return buildDashboardInsightsRequest(input as DashboardInsightsInput);
    case 'manager_copilot':
      return buildManagerCopilotRequest(input as ManagerCopilotInput);
  }
}

function buildFallback(agentName: AgentName, input: unknown) {
  switch (agentName) {
    case 'document_extraction_assistance':
      return buildDocumentExtractionFallback(input as DocumentExtractionAssistanceInput);
    case 'skill_normalization':
      return buildSkillNormalizationFallback(input as SkillNormalizationInput);
    case 'employee_summary':
      return buildEmployeeSummaryFallback(input as EmployeeSummaryInput);
    case 'task_summary':
      return buildTaskSummaryFallback(input as TaskSummaryInput);
    case 'match_explanation':
      return buildMatchExplanationFallback(input as MatchExplanationInput);
    case 'dashboard_insights':
      return buildDashboardInsightsFallback(input as DashboardInsightsInput);
    case 'manager_copilot':
      return buildManagerCopilotFallback(input as ManagerCopilotInput);
  }
}

function createFallback(
  agentName: AgentName,
  input: unknown,
  options: {
    code: string;
    message: string;
    modelProvider?: string;
    modelName?: string;
    modelVersion?: string;
    promptVersion?: string;
    warnings?: AgentWarning[];
    toolCallCount?: number;
  }
) {
  const output = finalizeOutput(agentName, input, buildFallback(agentName, input));
  return createFallbackEnvelope({
    agentName,
    output,
    inputRefs: buildInputRefs(agentName, input),
    fallbackCode: options.code,
    fallbackMessage: options.message,
    warnings: options.warnings,
    review: buildReviewCheckpoints(agentName, output),
    audit: {
      modelProvider: options.modelProvider,
      modelName: options.modelName,
      modelVersion: options.modelVersion,
      promptVersion: options.promptVersion,
      deterministicScoreUsed: inputUsesDeterministicScores(agentName, input),
      toolCallCount: options.toolCallCount,
    },
  });
}

function finalizeOutput(agentName: AgentName, input: unknown, output: unknown) {
  if (agentName !== 'match_explanation') return output;

  const matchInput = input as MatchExplanationInput;
  return createMatchExplanationOutput(
    matchInput.deterministicScore,
    matchInput.candidateEmployees.map((employee) => employee.id),
    output as never
  );
}

function buildInputRefs(agentName: AgentName, input: unknown): SourceRef[] {
  switch (agentName) {
    case 'document_extraction_assistance': {
      const value = input as DocumentExtractionAssistanceInput;
      return [{ sourceType: 'upload', sourceId: value.uploadId, recordId: value.fileName }];
    }
    case 'skill_normalization':
      return (input as SkillNormalizationInput).rawSkills.flatMap((skill) => skill.sourceRefs);
    case 'employee_summary': {
      const value = input as EmployeeSummaryInput;
      return [{ sourceType: 'database_record', sourceId: 'employee', recordId: value.employee.id }];
    }
    case 'task_summary': {
      const value = input as TaskSummaryInput;
      return [{ sourceType: 'database_record', sourceId: 'task', recordId: value.task.id }];
    }
    case 'match_explanation': {
      const value = input as MatchExplanationInput;
      return [
        { sourceType: 'deterministic_score', sourceId: value.deterministicScore.scoreId, recordId: value.task.id },
        { sourceType: 'database_record', sourceId: 'task', recordId: value.task.id },
        ...value.candidateEmployees.map((employee) => ({
          sourceType: 'database_record' as const,
          sourceId: 'employee',
          recordId: employee.id,
        })),
      ];
    }
    case 'dashboard_insights': {
      const value = input as DashboardInsightsInput;
      return [{ sourceType: 'deterministic_score', sourceId: value.snapshotScope, recordId: value.snapshotId }];
    }
    case 'manager_copilot': {
      const value = input as ManagerCopilotInput;
      return [
        { sourceType: 'manager_input', sourceId: value.conversationId, recordId: value.messageId },
        ...(value.contextRefs ?? []),
        ...buildToolResultInputRefs(value.toolResults),
      ];
    }
  }
}

function buildToolResultInputRefs(toolResults: AgentToolResult[] | undefined): SourceRef[] {
  if (!toolResults?.length) return [];

  return dedupeSourceRefs(
    toolResults.flatMap((result) => {
      const toolResultRef: SourceRef = { sourceType: 'tool_result', sourceId: result.toolName, recordId: result.resultRef };
      return [toolResultRef, ...(result.sourceRefs ?? [])];
    })
  );
}

function countInputToolResults(agentName: AgentName, input: unknown) {
  if (agentName !== 'manager_copilot') return 0;
  const toolResults = (input as ManagerCopilotInput).toolResults;
  return Array.isArray(toolResults) ? toolResults.length : 0;
}

function inputUsesDeterministicScores(agentName: AgentName, input: unknown) {
  if (agentName === 'match_explanation') return true;
  if (agentName !== 'manager_copilot') return false;

  const value = input as ManagerCopilotInput;
  return Boolean(
    value.deterministicScores?.length ||
      value.toolResults?.some((result) => result.toolName === 'score_matches')
  );
}

function dedupeSourceRefs(refs: SourceRef[]) {
  const seen = new Set<string>();
  const output: SourceRef[] = [];

  refs.forEach((ref) => {
    const key = JSON.stringify(ref);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(ref);
  });

  return output;
}

function buildReviewCheckpoints(agentName: AgentName, output: unknown): ReviewCheckpoint[] {
  switch (agentName) {
    case 'document_extraction_assistance': {
      const value = output as ReturnType<typeof buildDocumentExtractionFallback>;
      if (value.importReadiness === 'cannot_import') return [];
      return [
        createReviewCheckpoint(
          'confirm_import',
          'Review extracted records before committing them to WorkMatch.',
          [{ sourceType: 'manager_input', sourceId: 'document-extraction-review' }],
          true
        ),
      ];
    }
    case 'skill_normalization': {
      const value = output as ReturnType<typeof buildSkillNormalizationFallback>;
      return value.normalizedSkills
        .filter((skill) => skill.action === 'needs_review' || skill.mappingConfidence < 0.85 || skill.suggestedLevel)
        .slice(0, 5)
        .map((skill) =>
          createReviewCheckpoint('confirm_skill_mapping', skill.mappingReason, skill.sourceRefs, true, ['approve', 'edit', 'defer'])
        );
    }
    case 'match_explanation': {
      const value = output as ReturnType<typeof createMatchExplanationOutput>;
      if (value.explanation.confidence >= 0.75 && !value.explanation.staffingRisks.length) return [];
      return [
        createReviewCheckpoint(
          'confirm_recommendation',
          'Review the AI explanation before approving this recommendation.',
          value.explanation.citedRefs,
          true,
          ['approve', 'edit', 'defer']
        ),
      ];
    }
    case 'dashboard_insights': {
      const value = output as ReturnType<typeof buildDashboardInsightsFallback>;
      return value.insights.slice(0, 3).map((insight) =>
        createReviewCheckpoint(
          'acknowledge_insight',
          insight.headline,
          [{ sourceType: 'deterministic_score', sourceId: 'dashboard', recordId: insight.insightId }],
          false,
          ['approve', 'defer']
        )
      );
    }
    case 'manager_copilot': {
      const value = output as ReturnType<typeof buildManagerCopilotFallback>;
      return value.proposedActions
        .filter((action) => action.requiresManagerConfirmation)
        .map((action) =>
          createReviewCheckpoint('confirm_bulk_change', action.label, action.targetRefs, true, ['approve', 'reject', 'defer'])
        );
    }
    case 'employee_summary':
    case 'task_summary':
      return [];
  }
}

function buildWarnings(agentName: AgentName, output: unknown): AgentWarning[] {
  const confidence = readConfidence(agentName, output);
  if (confidence === undefined || confidence >= 0.75) return [];
  return [createLowConfidenceWarning([], `${agentName} returned ${Math.round(confidence * 100)}% confidence and should be reviewed.`)];
}

function readConfidence(agentName: AgentName, output: unknown) {
  if (!output || typeof output !== 'object') return undefined;
  if (agentName === 'match_explanation' && 'explanation' in output) {
    const explanation = (output as { explanation?: { confidence?: unknown } }).explanation;
    return typeof explanation?.confidence === 'number' ? explanation.confidence : undefined;
  }
  if (agentName === 'manager_copilot' && 'answer' in output) {
    const answer = (output as { answer?: { confidence?: unknown } }).answer;
    return typeof answer?.confidence === 'number' ? answer.confidence : undefined;
  }
  if ('confidence' in output && typeof (output as { confidence?: unknown }).confidence === 'number') {
    return (output as { confidence: number }).confidence;
  }
  return undefined;
}

function resolveOrganizationId(input: unknown, fallback?: string) {
  if (input && typeof input === 'object' && 'organizationId' in input && typeof input.organizationId === 'string') {
    return input.organizationId;
  }
  return fallback ?? 'demo-organization';
}

function apiKeyEnvName(provider: AiProvider) {
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
}

async function logRun(
  envelope: AgentOutputEnvelope<unknown>,
  input: unknown,
  startedAt: string,
  organizationId: string,
  triggeredByUserId?: string,
  options: {
    tokenInputCount?: number;
    tokenOutputCount?: number;
    errorCode?: string;
    errorMessage?: string;
  } = {}
) {
  await saveAgentRunLog({
    id: envelope.agentRunId,
    organizationId,
    agentName: envelope.agentName,
    status: envelope.status,
    startedAt,
    completedAt: envelope.generatedAt,
    triggeredByUserId,
    inputHash: hashAgentInput(input),
    inputSummary: summarizeAgentInput(input),
    outputSummary: summarizeAgentOutput(envelope.output),
    modelProvider: envelope.audit.modelProvider,
    modelName: envelope.audit.modelName,
    modelVersion: envelope.audit.modelVersion,
    promptVersion: envelope.audit.promptVersion,
    tokenInputCount: options.tokenInputCount,
    tokenOutputCount: options.tokenOutputCount,
    toolCallCount: envelope.audit.toolCallCount,
    fallbackUsed: envelope.audit.fallbackUsed,
    deterministicScoreUsed: envelope.audit.deterministicScoreUsed,
    errorCode: options.errorCode,
    errorMessage: options.errorMessage,
    envelope,
  });
}
