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
import { parseModelJson, type AgentValidationResult } from './helpers';
import type { AgentStructuredOutputSpec, JsonSchema } from './schemas';
import {
  dashboardInsightsSpec,
  documentExtractionAssistanceSpec,
  employeeSummarySpec,
  managerCopilotSpec,
  matchExplanationSpec,
  skillNormalizationSpec,
  taskSummarySpec,
} from './schemas';

export interface AgentModelRequest<TOutput> {
  agentName: AgentStructuredOutputSpec<TOutput>['agentName'];
  promptVersion: string;
  systemInstruction: string;
  userInstruction: string;
  responseMimeType: 'application/json';
  responseSchema: JsonSchema;
  input: unknown;
}

export interface AgentModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AgentModelClient {
  generateStructured<TOutput>(request: AgentModelRequest<TOutput>): Promise<string | unknown>;
}

const sharedSystemGuardrails = [
  'You are a WorkMatch staffing assistant operating behind a typed API route.',
  'Return only JSON that conforms to the provided schema.',
  'Cite sourceRefs for factual claims whenever source data is available.',
  'Set confidence from 0 to 1 and mark uncertain proposals for manager review.',
  'Do not save records, approve imports, approve skill ratings, or approve assignments.',
  'Never create, alter, round, or recalculate match percentages. Deterministic application code is the only score source.',
].join('\n');

function buildAgentModelRequest<TInput, TOutput>(
  spec: AgentStructuredOutputSpec<TOutput>,
  input: TInput,
  taskInstruction: string
): AgentModelRequest<TOutput> {
  return {
    agentName: spec.agentName,
    promptVersion: spec.promptVersion,
    responseMimeType: spec.responseMimeType,
    responseSchema: spec.responseSchema,
    systemInstruction: [sharedSystemGuardrails, spec.modelInstructions].join('\n'),
    userInstruction: [taskInstruction, 'Input JSON:', JSON.stringify(input)].join('\n\n'),
    input,
  };
}

export function buildDocumentExtractionAssistanceRequest(
  input: DocumentExtractionAssistanceInput
): AgentModelRequest<DocumentExtractionAssistanceOutput> {
  return buildAgentModelRequest(
    documentExtractionAssistanceSpec,
    input,
    'Assist extraction from the parsed document preview. Return proposed employee and task records only as review proposals.'
  );
}

export function buildSkillNormalizationRequest(input: SkillNormalizationInput): AgentModelRequest<SkillNormalizationOutput> {
  return buildAgentModelRequest(
    skillNormalizationSpec,
    input,
    'Normalize raw skills against the organization taxonomy. Preserve raw names and require review for semantic mappings or estimated levels.'
  );
}

export function buildEmployeeSummaryRequest(input: EmployeeSummaryInput): AgentModelRequest<EmployeeSummaryOutput> {
  return buildAgentModelRequest(
    employeeSummarySpec,
    input,
    'Summarize the employee for a manager using only the supplied employee data, related tasks, and deterministic scores.'
  );
}

export function buildTaskSummaryRequest(input: TaskSummaryInput): AgentModelRequest<TaskSummaryOutput> {
  return buildAgentModelRequest(
    taskSummarySpec,
    input,
    'Summarize the task staffing need, risks, and next actions using supplied task data and deterministic staffing signals.'
  );
}

export function buildMatchExplanationRequest(input: MatchExplanationInput): AgentModelRequest<MatchExplanationModelOutput> {
  return buildAgentModelRequest(
    matchExplanationSpec,
    input,
    'Explain the provided deterministic score breakdown. The response schema intentionally excludes score fields; explain only.'
  );
}

export function buildDashboardInsightsRequest(input: DashboardInsightsInput): AgentModelRequest<DashboardInsightsOutput> {
  return buildAgentModelRequest(
    dashboardInsightsSpec,
    input,
    'Turn the supplied deterministic dashboard metrics into traceable insight cards and non-mutating recommended actions.'
  );
}

export function buildManagerCopilotRequest(input: ManagerCopilotInput): AgentModelRequest<ManagerCopilotOutput> {
  return buildAgentModelRequest(
    managerCopilotSpec,
    input,
    'Answer the manager question from supplied data and tool results. Return refusals for unsafe or out-of-scope actions.'
  );
}

export async function generateStructuredAgentOutput<TOutput>(
  client: AgentModelClient,
  request: AgentModelRequest<TOutput>
): Promise<AgentValidationResult<TOutput>> {
  const raw = await client.generateStructured(request);

  if (typeof raw === 'string') {
    const parsed = parseModelJson(raw);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: parsed.value as TOutput,
      warnings: parsed.warnings,
    };
  }

  return {
    ok: true,
    value: raw as TOutput,
    warnings: [],
  };
}
