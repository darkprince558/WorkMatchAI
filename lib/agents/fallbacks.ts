import type {
  DashboardInsightsInput,
  DashboardInsightsOutput,
  DocumentExtractionAssistanceInput,
  DocumentExtractionAssistanceOutput,
  EmployeeSummaryInput,
  EmployeeSummaryOutput,
  ManagerCopilotInput,
  ManagerCopilotOutput,
  MatchExplanationInput,
  MatchExplanationModelOutput,
  SkillNormalizationInput,
  SkillNormalizationOutput,
  TaskSummaryInput,
  TaskSummaryOutput,
} from './contracts';

export function buildDocumentExtractionFallback(input: DocumentExtractionAssistanceInput): DocumentExtractionAssistanceOutput {
  return {
    detectedDocumentType: input.parserOutput?.detectedType ?? 'unknown',
    proposedEmployees: [],
    proposedTasks: [],
    duplicateCandidates: [],
    missingFieldWarnings: input.parserOutput?.parserWarnings ?? [],
    importReadiness: 'needs_correction',
    extractionNotes: [
      'Model extraction assistance is unavailable. Use parser previews and manager column mapping before importing records.',
    ],
  };
}

export function buildSkillNormalizationFallback(input: SkillNormalizationInput): SkillNormalizationOutput {
  return {
    normalizedSkills: input.rawSkills.map((skill) => ({
      rawSkillId: skill.rawSkillId,
      rawName: skill.rawName,
      mappingConfidence: 0.5,
      mappingReason: 'Model semantic mapping is unavailable; preserve raw skill name for manager review.',
      action: 'needs_review',
      sourceRefs: skill.sourceRefs,
    })),
  };
}

export function buildEmployeeSummaryFallback(input: EmployeeSummaryInput): EmployeeSummaryOutput {
  const topSkills = input.employee.skills
    .slice()
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((skill) => skill.name);

  return {
    employeeId: input.employee.id,
    headline: `${input.employee.name} is a ${input.employee.role} in ${input.employee.department}.`,
    strengths: topSkills,
    capacitySummary: `${input.employee.availability}% available capacity with ${input.employee.readiness.toLowerCase()} readiness.`,
    growthOpportunities: input.employee.interests ?? [],
    staffingRisks: input.employee.availability < 30 ? ['Limited near-term availability.'] : [],
    recommendedNextActions: ['Open the employee profile for manager review.'],
    citedRefs: [{ sourceType: 'database_record', sourceId: 'employee', recordId: input.employee.id }],
    confidence: 0.8,
  };
}

export function buildTaskSummaryFallback(input: TaskSummaryInput): TaskSummaryOutput {
  return {
    taskId: input.task.id,
    headline: `${input.task.name} needs ${input.task.teamSize} ${input.task.teamSize === 1 ? 'person' : 'people'}.`,
    deliveryNeed: `${input.task.urgency} urgency, ${input.task.estHours} estimated hours, deadline ${input.task.deadline}.`,
    requiredCoverageSummary: `${input.task.requiredSkills.length} required skills and ${input.task.optionalSkills.length} optional skills listed.`,
    staffingRisks: input.task.requiredSkills.length ? [] : ['No required skills are listed for this task.'],
    recommendedNextActions: ['Run deterministic matching or open task review.'],
    citedRefs: [{ sourceType: 'database_record', sourceId: 'task', recordId: input.task.id }],
    confidence: 0.8,
  };
}

export function buildMatchExplanationFallback(input: MatchExplanationInput): MatchExplanationModelOutput {
  const employeeNames = input.candidateEmployees.map((employee) => employee.name).join(', ');

  return {
    summary: `${employeeNames || 'The candidate'} has a deterministic ${input.deterministicScore.label} score of ${input.deterministicScore.totalScore}% for this task.`,
    coveredRequiredSkills: [],
    missingOrWeakSkills: [],
    availabilityWarnings: input.deterministicScore.componentScores.availability < 50 ? ['Availability is a potential constraint.'] : [],
    trainingSuggestions: [],
    staffingRisks: input.deterministicScore.hardConstraintResults.filter((constraint) => !constraint.passed).map((constraint) => constraint.message),
    alternativeCandidateIds: input.alternativeScores?.map((score) => score.employeeId ?? score.teamMemberIds?.join('|') ?? score.scoreId) ?? [],
    recommendationBasis: 'balanced',
    citedRefs: [{ sourceType: 'deterministic_score', sourceId: input.deterministicScore.scoreId, recordId: input.deterministicScore.taskId }],
    confidence: 0.75,
  };
}

export function buildDashboardInsightsFallback(input: DashboardInsightsInput): DashboardInsightsOutput {
  const riskMetrics = input.metrics.filter((metric) => metric.metricName.toLowerCase().includes('risk'));

  return {
    snapshotId: input.snapshotId,
    insights: riskMetrics.map((metric, index) => {
      const label = humanizeMetricName(metric.metricName);
      return {
        insightId: `${input.snapshotId}-fallback-${index + 1}`,
        type: 'project_staffing_risk',
        severity: 'watch',
        headline: `${label}: ${metric.value}`,
        explanation: `${label} is above the normal review threshold for the current workspace snapshot.`,
        supportingMetrics: [metric],
        relatedEmployeeIds: [],
        relatedTaskIds: [],
        relatedSkillIds: [],
        recommendedActions: ['Review affected projects and confirm staffing owners.'],
        confidence: 0.75,
      };
    }),
  };
}

export function buildManagerCopilotFallback(input: ManagerCopilotInput): ManagerCopilotOutput {
  return {
    answer: {
      summary: 'Manager copilot is unavailable in fallback mode.',
      details: ['Use deterministic views and review flows until model-backed answers are configured.'],
      citedRefs: input.contextRefs ?? [],
      confidence: 1,
    },
    toolResultsUsed: [],
    proposedActions: [
      {
        actionId: `${input.messageId}-open-matching`,
        actionType: 'run_matching',
        label: 'Run deterministic matching',
        requiresManagerConfirmation: false,
        targetRefs: input.contextRefs ?? [],
      },
    ],
    refusal: {
      reason: 'missing_data',
      message: 'No model-backed copilot response was generated.',
    },
  };
}

function humanizeMetricName(metricName: string) {
  return metricName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\brisk\b/gi, 'risk')
    .replace(/^./, (char) => char.toUpperCase());
}
