import type {
  AgentName,
  DashboardInsightsOutput,
  DocumentExtractionAssistanceOutput,
  EmployeeSummaryOutput,
  ManagerCopilotOutput,
  MatchExplanationModelOutput,
  SkillNormalizationOutput,
  TaskSummaryOutput,
} from './contracts';
import type { AgentValidationResult } from './helpers';
import { isRecord } from './helpers';

export type AgentOutputByName = {
  document_extraction_assistance: DocumentExtractionAssistanceOutput;
  skill_normalization: SkillNormalizationOutput;
  employee_summary: EmployeeSummaryOutput;
  task_summary: TaskSummaryOutput;
  match_explanation: MatchExplanationModelOutput;
  dashboard_insights: DashboardInsightsOutput;
  manager_copilot: ManagerCopilotOutput;
};

export function validateStructuredOutput<TAgentName extends AgentName>(
  agentName: TAgentName,
  value: unknown
): AgentValidationResult<AgentOutputByName[TAgentName]> {
  const issues = getAgentIssues(agentName, value);

  if (issues.length) {
    return {
      ok: false,
      issues,
      warnings: [
        {
          code: 'AGENT_OUTPUT_VALIDATION_FAILED',
          severity: 'blocking',
          message: issues.join(' '),
        },
      ],
    };
  }

  return {
    ok: true,
    value: value as AgentOutputByName[TAgentName],
    warnings: [],
  };
}

function getAgentIssues(agentName: AgentName, value: unknown) {
  if (!isRecord(value)) return ['Model output must be an object.'];

  switch (agentName) {
    case 'document_extraction_assistance':
      return required(value, [
        'detectedDocumentType',
        'proposedEmployees',
        'proposedTasks',
        'duplicateCandidates',
        'missingFieldWarnings',
        'importReadiness',
        'extractionNotes',
      ]);
    case 'skill_normalization':
      return required(value, ['normalizedSkills']).concat(arrayIssue(value, 'normalizedSkills'));
    case 'employee_summary':
      return required(value, [
        'employeeId',
        'headline',
        'strengths',
        'capacitySummary',
        'growthOpportunities',
        'staffingRisks',
        'recommendedNextActions',
        'citedRefs',
        'confidence',
      ]).concat(confidenceIssue(value, 'confidence'));
    case 'task_summary':
      return required(value, [
        'taskId',
        'headline',
        'deliveryNeed',
        'requiredCoverageSummary',
        'staffingRisks',
        'recommendedNextActions',
        'citedRefs',
        'confidence',
      ]).concat(confidenceIssue(value, 'confidence'));
    case 'match_explanation':
      return required(value, [
        'summary',
        'coveredRequiredSkills',
        'missingOrWeakSkills',
        'availabilityWarnings',
        'trainingSuggestions',
        'staffingRisks',
        'alternativeCandidateIds',
        'recommendationBasis',
        'citedRefs',
        'confidence',
      ]).concat(confidenceIssue(value, 'confidence'));
    case 'dashboard_insights':
      return required(value, ['snapshotId', 'insights']).concat(arrayIssue(value, 'insights'));
    case 'manager_copilot':
      return required(value, ['answer', 'toolResultsUsed', 'proposedActions']).concat(arrayIssue(value, 'proposedActions'));
    default:
      return [`Unknown agent ${agentName}.`];
  }
}

function required(value: Record<string, unknown>, keys: string[]) {
  return keys.filter((key) => value[key] === undefined || value[key] === null).map((key) => `Missing ${key}.`);
}

function arrayIssue(value: Record<string, unknown>, key: string) {
  return Array.isArray(value[key]) ? [] : [`${key} must be an array.`];
}

function confidenceIssue(value: Record<string, unknown>, key: string) {
  const confidence = value[key];
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return [`${key} must be a number from 0 to 1.`];
  }
  return [];
}
