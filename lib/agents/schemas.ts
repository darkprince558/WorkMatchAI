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

export type JsonSchemaPrimitiveType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface JsonSchema {
  type?: JsonSchemaPrimitiveType | readonly JsonSchemaPrimitiveType[];
  description?: string;
  enum?: readonly string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: readonly JsonSchema[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
}

export interface AgentStructuredOutputSpec<TOutput> {
  agentName: AgentName;
  promptVersion: string;
  responseMimeType: 'application/json';
  responseSchema: JsonSchema;
  modelInstructions: string;
  outputDescription: string;
  parseTarget?: TOutput;
}

const stringSchema: JsonSchema = { type: 'string' };
const confidenceSchema: JsonSchema = { type: 'number', minimum: 0, maximum: 1 };
const stringArraySchema: JsonSchema = { type: 'array', items: stringSchema };

const sourceRefSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceType', 'sourceId'],
  properties: {
    sourceType: {
      type: 'string',
      enum: ['upload', 'database_record', 'manager_input', 'sample_data', 'tool_result', 'deterministic_score'],
    },
    sourceId: stringSchema,
    recordId: stringSchema,
    page: { type: 'integer', minimum: 1 },
    row: { type: 'integer', minimum: 1 },
    column: stringSchema,
    charRange: {
      type: 'object',
      additionalProperties: false,
      required: ['start', 'end'],
      properties: {
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 0 },
      },
    },
  },
};

const warningSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'severity', 'message'],
  properties: {
    code: stringSchema,
    severity: { type: 'string', enum: ['info', 'warning', 'blocking'] },
    message: stringSchema,
    sourceRefs: { type: 'array', items: sourceRefSchema },
  },
};

const sourceRefArraySchema: JsonSchema = { type: 'array', items: sourceRefSchema };

const fieldValueSchema = (valueSchema: JsonSchema): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: ['value', 'confidence', 'sourceRefs', 'requiresReview'],
  properties: {
    value: valueSchema,
    confidence: confidenceSchema,
    sourceRefs: sourceRefArraySchema,
    requiresReview: { type: 'boolean' },
  },
});

const extractedSkillSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rawName'],
  properties: {
    rawName: stringSchema,
    normalizedName: stringSchema,
    level: { type: 'number', minimum: 1, maximum: 10 },
    levelWasExplicit: { type: 'boolean' },
  },
};

const extractedSkillRequirementSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rawName'],
  properties: {
    rawName: stringSchema,
    normalizedName: stringSchema,
    minimumLevel: { type: 'number', minimum: 1, maximum: 10 },
    importance: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
  },
};

const proposedEmployeeSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['temporaryRecordId', 'fields'],
  properties: {
    temporaryRecordId: stringSchema,
    fields: {
      type: 'object',
      additionalProperties: false,
      properties: {
        employeeId: fieldValueSchema(stringSchema),
        name: fieldValueSchema(stringSchema),
        role: fieldValueSchema(stringSchema),
        department: fieldValueSchema(stringSchema),
        location: fieldValueSchema(stringSchema),
        timezone: fieldValueSchema(stringSchema),
        capacityPercentage: fieldValueSchema({ type: 'number', minimum: 0, maximum: 100 }),
        yearsExperience: fieldValueSchema({ type: 'number', minimum: 0 }),
        skills: fieldValueSchema({ type: 'array', items: extractedSkillSchema }),
        certifications: fieldValueSchema(stringArraySchema),
        interests: fieldValueSchema(stringArraySchema),
        careerGoals: fieldValueSchema(stringSchema),
        pastProjects: fieldValueSchema(stringArraySchema),
      },
    },
  },
};

const proposedTaskSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['temporaryRecordId', 'fields'],
  properties: {
    temporaryRecordId: stringSchema,
    fields: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: fieldValueSchema(stringSchema),
        name: fieldValueSchema(stringSchema),
        description: fieldValueSchema(stringSchema),
        requiredSkills: fieldValueSchema({ type: 'array', items: extractedSkillRequirementSchema }),
        optionalSkills: fieldValueSchema(stringArraySchema),
        urgency: fieldValueSchema({ type: 'string', enum: ['low', 'medium', 'high', 'critical'] }),
        deadline: fieldValueSchema(stringSchema),
        estimatedHours: fieldValueSchema({ type: 'number', minimum: 0 }),
        staffingMode: fieldValueSchema({ type: 'string', enum: ['individual', 'team'] }),
        teamSize: fieldValueSchema({ type: 'integer', minimum: 1 }),
      },
    },
  },
};

export const documentExtractionAssistanceSpec: AgentStructuredOutputSpec<DocumentExtractionAssistanceOutput> = {
  agentName: 'document_extraction_assistance',
  promptVersion: 'document-extraction-assistance-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Assisted extraction proposals that must flow through manager import review.',
  modelInstructions:
    'Extract only evidence-backed employee or task fields. Mark low confidence fields for review and never write source-of-truth records.',
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'detectedDocumentType',
      'proposedEmployees',
      'proposedTasks',
      'duplicateCandidates',
      'missingFieldWarnings',
      'importReadiness',
      'extractionNotes',
    ],
    properties: {
      detectedDocumentType: { type: 'string', enum: ['employee_data', 'task_data', 'mixed', 'unknown'] },
      proposedEmployees: { type: 'array', items: proposedEmployeeSchema },
      proposedTasks: { type: 'array', items: proposedTaskSchema },
      duplicateCandidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['proposedRecordId', 'existingRecordType', 'existingRecordId', 'reason', 'confidence'],
          properties: {
            proposedRecordId: stringSchema,
            existingRecordType: { type: 'string', enum: ['employee', 'task', 'imported_record'] },
            existingRecordId: stringSchema,
            reason: stringSchema,
            confidence: confidenceSchema,
          },
        },
      },
      missingFieldWarnings: { type: 'array', items: warningSchema },
      importReadiness: { type: 'string', enum: ['ready_for_review', 'needs_correction', 'cannot_import'] },
      extractionNotes: stringArraySchema,
    },
  },
};

export const skillNormalizationSpec: AgentStructuredOutputSpec<SkillNormalizationOutput> = {
  agentName: 'skill_normalization',
  promptVersion: 'skill-normalization-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Skill taxonomy mapping proposals and reviewed level suggestions.',
  modelInstructions:
    'Map skills to existing taxonomy when evidence supports it. Estimated employee levels always require manager approval.',
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['normalizedSkills'],
    properties: {
      normalizedSkills: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['rawSkillId', 'rawName', 'mappingConfidence', 'mappingReason', 'action', 'sourceRefs'],
          properties: {
            rawSkillId: stringSchema,
            rawName: stringSchema,
            normalizedSkillId: stringSchema,
            normalizedName: stringSchema,
            canonicalCategory: stringSchema,
            mappingConfidence: confidenceSchema,
            mappingReason: stringSchema,
            suggestedLevel: {
              type: 'object',
              additionalProperties: false,
              required: ['value', 'levelLabel', 'confidence', 'evidence', 'requiresManagerApproval'],
              properties: {
                value: { type: 'number', minimum: 1, maximum: 10 },
                levelLabel: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
                confidence: confidenceSchema,
                evidence: stringArraySchema,
                requiresManagerApproval: { type: 'boolean' },
              },
            },
            action: { type: 'string', enum: ['use_existing', 'create_alias', 'create_new_skill', 'needs_review'] },
            sourceRefs: sourceRefArraySchema,
          },
        },
      },
    },
  },
};

const summarySchema = (idField: 'employeeId' | 'taskId'): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required:
    idField === 'employeeId'
      ? ['employeeId', 'headline', 'strengths', 'capacitySummary', 'growthOpportunities', 'staffingRisks', 'recommendedNextActions', 'citedRefs', 'confidence']
      : ['taskId', 'headline', 'deliveryNeed', 'requiredCoverageSummary', 'staffingRisks', 'recommendedNextActions', 'citedRefs', 'confidence'],
  properties:
    idField === 'employeeId'
      ? {
          employeeId: stringSchema,
          headline: stringSchema,
          strengths: stringArraySchema,
          capacitySummary: stringSchema,
          growthOpportunities: stringArraySchema,
          staffingRisks: stringArraySchema,
          recommendedNextActions: stringArraySchema,
          citedRefs: sourceRefArraySchema,
          confidence: confidenceSchema,
        }
      : {
          taskId: stringSchema,
          headline: stringSchema,
          deliveryNeed: stringSchema,
          requiredCoverageSummary: stringSchema,
          staffingRisks: stringArraySchema,
          recommendedNextActions: stringArraySchema,
          citedRefs: sourceRefArraySchema,
          confidence: confidenceSchema,
        },
});

export const employeeSummarySpec: AgentStructuredOutputSpec<EmployeeSummaryOutput> = {
  agentName: 'employee_summary',
  promptVersion: 'employee-summary-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Traceable employee summary grounded in approved employee data and deterministic scores.',
  modelInstructions:
    'Summarize employee strengths, capacity, risks, and next actions. Do not invent availability, skill ratings, or match percentages.',
  responseSchema: summarySchema('employeeId'),
};

export const taskSummarySpec: AgentStructuredOutputSpec<TaskSummaryOutput> = {
  agentName: 'task_summary',
  promptVersion: 'task-summary-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Traceable task summary grounded in task data and deterministic staffing signals.',
  modelInstructions:
    'Summarize delivery need, required coverage, risks, and next actions. Do not invent deadlines, estimated hours, or scores.',
  responseSchema: summarySchema('taskId'),
};

export const matchExplanationSpec: AgentStructuredOutputSpec<MatchExplanationModelOutput> = {
  agentName: 'match_explanation',
  promptVersion: 'match-explanation-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Narrative explanation for a deterministic score supplied by application code.',
  modelInstructions:
    'Explain the supplied deterministic score breakdown without adding, changing, rounding, or recalculating any percentage.',
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
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
    ],
    properties: {
      summary: stringSchema,
      coveredRequiredSkills: stringArraySchema,
      missingOrWeakSkills: stringArraySchema,
      availabilityWarnings: stringArraySchema,
      trainingSuggestions: stringArraySchema,
      staffingRisks: stringArraySchema,
      alternativeCandidateIds: stringArraySchema,
      recommendationBasis: { type: 'string', enum: ['delivery', 'availability', 'growth', 'balanced'] },
      citedRefs: sourceRefArraySchema,
      confidence: confidenceSchema,
    },
  },
};

export const dashboardInsightsSpec: AgentStructuredOutputSpec<DashboardInsightsOutput> = {
  agentName: 'dashboard_insights',
  promptVersion: 'dashboard-insights-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Dashboard insights grounded in deterministic workforce metrics.',
  modelInstructions:
    'Explain deterministic workforce metrics and propose non-mutating next actions. Do not change assignments, capacity, or project status.',
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['snapshotId', 'insights'],
    properties: {
      snapshotId: stringSchema,
      insights: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'insightId',
            'type',
            'severity',
            'headline',
            'explanation',
            'supportingMetrics',
            'relatedEmployeeIds',
            'relatedTaskIds',
            'relatedSkillIds',
            'recommendedActions',
            'confidence',
          ],
          properties: {
            insightId: stringSchema,
            type: {
              type: 'string',
              enum: [
                'skill_shortage',
                'overload_risk',
                'underutilized_employee',
                'project_staffing_risk',
                'training_opportunity',
                'hiring_signal',
              ],
            },
            severity: { type: 'string', enum: ['info', 'watch', 'risk', 'critical'] },
            headline: stringSchema,
            explanation: stringSchema,
            supportingMetrics: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['metricName', 'value', 'calculationSource'],
                properties: {
                  metricName: stringSchema,
                  value: {
                    anyOf: [
                      { type: 'number' },
                      { type: 'string' },
                    ],
                    description: 'Numeric or string metric value.',
                  },
                  calculationSource: { type: 'string', enum: ['deterministic_query', 'deterministic_score'] },
                },
              },
            },
            relatedEmployeeIds: stringArraySchema,
            relatedTaskIds: stringArraySchema,
            relatedSkillIds: stringArraySchema,
            recommendedActions: stringArraySchema,
            confidence: confidenceSchema,
          },
        },
      },
    },
  },
};

export const managerCopilotSpec: AgentStructuredOutputSpec<ManagerCopilotOutput> = {
  agentName: 'manager_copilot',
  promptVersion: 'manager-copilot-v1',
  responseMimeType: 'application/json',
  outputDescription: 'Traceable manager answer with safe proposed actions.',
  modelInstructions:
    'Answer from approved data and cited tool results only. Draft review actions, but never approve imports, ratings, or assignments without explicit confirmation.',
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'toolResultsUsed', 'proposedActions'],
    properties: {
      answer: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'details', 'citedRefs', 'confidence'],
        properties: {
          summary: stringSchema,
          details: stringArraySchema,
          citedRefs: sourceRefArraySchema,
          confidence: confidenceSchema,
        },
      },
      toolResultsUsed: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['toolCallId', 'toolName', 'resultRef'],
          properties: {
            toolCallId: stringSchema,
            toolName: stringSchema,
            resultRef: stringSchema,
          },
        },
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
        },
      },
      proposedActions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['actionId', 'actionType', 'label', 'requiresManagerConfirmation', 'targetRefs'],
          properties: {
            actionId: stringSchema,
            actionType: {
              type: 'string',
              enum: [
                'open_employee',
                'open_task',
                'run_matching',
                'draft_assignment_review',
                'draft_import_review',
                'show_insight_drilldown',
              ],
            },
            label: stringSchema,
            requiresManagerConfirmation: { type: 'boolean' },
            targetRefs: sourceRefArraySchema,
          },
        },
      },
      refusal: {
        type: 'object',
        additionalProperties: false,
        required: ['reason', 'message'],
        properties: {
          reason: { type: 'string', enum: ['insufficient_permissions', 'missing_data', 'unsafe_action', 'out_of_scope'] },
          message: stringSchema,
        },
      },
    },
  },
};

export const agentStructuredOutputSpecs = {
  document_extraction_assistance: documentExtractionAssistanceSpec,
  skill_normalization: skillNormalizationSpec,
  employee_summary: employeeSummarySpec,
  task_summary: taskSummarySpec,
  match_explanation: matchExplanationSpec,
  dashboard_insights: dashboardInsightsSpec,
  manager_copilot: managerCopilotSpec,
} satisfies Record<AgentName, AgentStructuredOutputSpec<unknown>>;
