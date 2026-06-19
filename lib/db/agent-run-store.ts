import crypto from 'node:crypto';
import type { AgentName, AgentOutputEnvelope, AgentStatus } from '../agents/contracts';
import { estimateModelCost } from '../monitoring/costs';
import { ensureOrganization } from './organizations';

export interface AgentRunLogRecord {
  id: string;
  organizationId: string;
  agentName: AgentName;
  status: AgentStatus;
  startedAt: string;
  completedAt: string;
  triggeredByUserId?: string;
  inputHash: string;
  inputSummary: string;
  outputSummary: string;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptVersion?: string;
  tokenInputCount?: number;
  tokenOutputCount?: number;
  estimatedCostUsd?: number;
  toolCallCount: number;
  fallbackUsed: boolean;
  deterministicScoreUsed: boolean;
  errorCode?: string;
  errorMessage?: string;
  envelope: AgentOutputEnvelope<unknown>;
}

type WorkMatchGlobal = typeof globalThis & {
  __workmatchAgentRuns?: AgentRunLogRecord[];
};

const maxStoredRuns = 250;

export async function saveAgentRunLog(record: AgentRunLogRecord) {
  record.estimatedCostUsd ??= estimateModelCost(record.modelProvider, record.tokenInputCount, record.tokenOutputCount);
  const memoryStore = getMemoryStore();
  memoryStore.unshift(record);
  if (memoryStore.length > maxStoredRuns) memoryStore.length = maxStoredRuns;
  await saveAgentRunLogToSupabase(record).catch(() => undefined);
  return record;
}

export async function listAgentRunLogs(organizationId?: string) {
  const memory = getMemoryStore();
  if (!organizationId) return memory;
  return memory.filter((record) => record.organizationId === organizationId);
}

export function hashAgentInput(input: unknown) {
  return crypto.createHash('sha256').update(safeStringify(input)).digest('hex');
}

export function summarizeAgentInput(input: unknown) {
  const text = safeStringify(redactForLog(input));
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export function summarizeAgentOutput(output: unknown) {
  const text = safeStringify(redactForLog(output));
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function getMemoryStore() {
  const workMatchGlobal = globalThis as WorkMatchGlobal;
  workMatchGlobal.__workmatchAgentRuns ??= [];
  return workMatchGlobal.__workmatchAgentRuns;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactForLog(item, depth + 1));
  if (typeof value === 'string') return redactLogString(value);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, item]) => [
        key,
        isSensitiveLogKey(key) ? '[redacted]' : redactForLog(item, depth + 1),
      ])
  );
}

function isSensitiveLogKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const sensitiveKeys = new Set([
    'answer',
    'candidateemployees',
    'careergoals',
    'certifications',
    'conversation',
    'dataurl',
    'email',
    'employee',
    'employees',
    'explanation',
    'extractedtext',
    'filename',
    'fullname',
    'headline',
    'location',
    'managerinput',
    'message',
    'name',
    'parseroutput',
    'pastprojects',
    'profileupdate',
    'question',
    'rationale',
    'rawtext',
    'reason',
    'recommendation',
    'recommendations',
    'resume',
    'recordid',
    'sourcefile',
    'sourceid',
    'staffingrisks',
    'summary',
    'task',
    'tasks',
    'text',
    'uploadid',
  ]);

  return sensitiveKeys.has(normalized) || /authorization|cookie|password|secret|token|api[_-]?key|refresh/i.test(key);
}

function redactLogString(value: string) {
  if (value.length > 80 || /@/.test(value) || /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(value)) {
    return '[redacted text]';
  }

  return value;
}

async function saveAgentRunLogToSupabase(record: AgentRunLogRecord) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  await ensureOrganization(record.organizationId);

  await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/agent_runs`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id: record.id,
      organization_id: record.organizationId,
      agent_name: record.agentName,
      workflow_version: record.envelope.workflowVersion,
      status: record.status,
      started_at: record.startedAt,
      completed_at: record.completedAt,
      triggered_by_user_id: record.triggeredByUserId ?? null,
      trigger_type: 'manual_request',
      input_hash: record.inputHash,
      input_summary: record.inputSummary,
      output_summary: record.outputSummary,
      model_provider: record.modelProvider ?? null,
      model_name: record.modelName ?? null,
      model_version: record.modelVersion ?? null,
      prompt_version: record.promptVersion ?? null,
      token_input_count: record.tokenInputCount ?? null,
      token_output_count: record.tokenOutputCount ?? null,
      estimated_cost_usd: record.estimatedCostUsd ?? null,
      tool_call_count: record.toolCallCount,
      fallback_used: record.fallbackUsed,
      deterministic_score_used: record.deterministicScoreUsed,
      error_code: record.errorCode ?? null,
      error_message: record.errorMessage ?? null,
    }),
  });
}
