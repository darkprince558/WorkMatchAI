import { listAgentRunLogs } from '@/lib/db/agent-run-store';
import { ensureOrganization } from '@/lib/db/organizations';
import { eqFilter, isSupabasePersistenceConfigured, supabaseRestRequest } from '@/lib/db/supabase-rest';
import { getAgentModelClientStatus } from '@/lib/agents/model-clients';
import type { AiProviderSetting } from '@/lib/settings';
import { estimateModelCost, roundCurrency } from './costs';

export type MonitoringSeverity = 'info' | 'warning' | 'error';
export type MonitoringEventType = 'parser_failure' | 'route_error' | 'persistence_write';

export const MONITORING_SEVERITIES = ['info', 'warning', 'error'] as const satisfies readonly MonitoringSeverity[];
export const MONITORING_EVENT_TYPES = ['parser_failure', 'route_error', 'persistence_write'] as const satisfies readonly MonitoringEventType[];

const maxStoredEvents = 250;

export interface MonitoringEventRecord {
  id: string;
  organizationId: string;
  eventType: MonitoringEventType;
  severity: MonitoringSeverity;
  source?: string;
  route?: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MonitoringSummary {
  persistenceMode: 'supabase' | 'memory';
  ai: {
    provider: string;
    model: string;
    configured: boolean;
    totalRuns: number;
    liveRuns: number;
    fallbackRuns: number;
    fallbackRate: number;
    tokenInputCount: number;
    tokenOutputCount: number;
    estimatedCostUsd: number;
  };
  parsers: {
    failureEvents: number;
    lastFailureAt?: string;
  };
  routes: {
    errorEvents: number;
    lastErrorAt?: string;
  };
  recentEvents: MonitoringEventRecord[];
}

type WorkMatchMonitoringGlobal = typeof globalThis & {
  __workmatchMonitoringEvents?: MonitoringEventRecord[];
};

export async function recordMonitoringEvent(input: {
  organizationId: string;
  eventType: MonitoringEventType;
  severity?: MonitoringSeverity;
  source?: string;
  route?: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const record: MonitoringEventRecord = {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    eventType: input.eventType,
    severity: input.severity ?? 'info',
    source: truncate(input.source, 160),
    route: truncate(input.route, 160),
    message: truncate(input.message, 600) ?? 'Monitoring event recorded.',
    metadata: normalizeMetadata(input.metadata),
    createdAt: new Date().toISOString(),
  };

  const memoryEvents = getMemoryEvents();
  memoryEvents.unshift(record);
  if (memoryEvents.length > maxStoredEvents) memoryEvents.length = maxStoredEvents;
  await saveMonitoringEventToSupabase(record).catch(() => undefined);
  return record;
}

export async function getMonitoringSummary(organizationId: string, provider?: AiProviderSetting): Promise<MonitoringSummary> {
  const [agentRuns, events] = await Promise.all([getAgentRunsForSummary(organizationId), getEventsForSummary(organizationId)]);
  const modelStatus = getAgentModelClientStatus(provider);
  const fallbackRuns = agentRuns.filter((run) => run.fallbackUsed).length;
  const tokenInputCount = agentRuns.reduce((sum, run) => sum + (run.tokenInputCount ?? 0), 0);
  const tokenOutputCount = agentRuns.reduce((sum, run) => sum + (run.tokenOutputCount ?? 0), 0);
  const parserFailures = events.filter((event) => event.eventType === 'parser_failure');
  const routeErrors = events.filter((event) => event.eventType === 'route_error');

  return {
    persistenceMode: isSupabasePersistenceConfigured() ? 'supabase' : 'memory',
    ai: {
      provider: modelStatus.provider,
      model: modelStatus.model,
      configured: modelStatus.configured,
      totalRuns: agentRuns.length,
      liveRuns: agentRuns.filter((run) => !run.fallbackUsed).length,
      fallbackRuns,
      fallbackRate: agentRuns.length ? Math.round((fallbackRuns / agentRuns.length) * 100) : 0,
      tokenInputCount,
      tokenOutputCount,
      estimatedCostUsd: roundCurrency(
        agentRuns.reduce(
          (sum, run) => sum + (run.estimatedCostUsd ?? estimateModelCost(run.modelProvider, run.tokenInputCount, run.tokenOutputCount)),
          0
        )
      ),
    },
    parsers: {
      failureEvents: parserFailures.length,
      lastFailureAt: parserFailures[0]?.createdAt,
    },
    routes: {
      errorEvents: routeErrors.length,
      lastErrorAt: routeErrors[0]?.createdAt,
    },
    recentEvents: events.slice(0, 10),
  };
}

function getMemoryEvents() {
  const workMatchGlobal = globalThis as WorkMatchMonitoringGlobal;
  workMatchGlobal.__workmatchMonitoringEvents ??= [];
  return workMatchGlobal.__workmatchMonitoringEvents;
}

function truncate(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return undefined;

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 16 * 1024) {
      return { truncated: true, reason: 'metadata exceeded storage limit' };
    }
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return { truncated: true, reason: 'metadata was not JSON serializable' };
  }
}

async function getAgentRunsForSummary(organizationId: string) {
  if (!isSupabasePersistenceConfigured()) {
    return (await listAgentRunLogs(organizationId)).map((run) => ({
      fallbackUsed: run.fallbackUsed,
      tokenInputCount: run.tokenInputCount,
      tokenOutputCount: run.tokenOutputCount,
      modelProvider: run.modelProvider,
      estimatedCostUsd: run.estimatedCostUsd,
    }));
  }

  return supabaseRestRequest<
    Array<{
      fallback_used: boolean;
      token_input_count: number | null;
      token_output_count: number | null;
      estimated_cost_usd: number | null;
      model_provider: string | null;
    }>
  >(
    `agent_runs?${eqFilter('organization_id', organizationId)}&select=fallback_used,token_input_count,token_output_count,estimated_cost_usd,model_provider&order=created_at.desc&limit=250`
  ).then((rows) =>
    rows.map((row) => ({
      fallbackUsed: row.fallback_used,
      tokenInputCount: row.token_input_count ?? undefined,
      tokenOutputCount: row.token_output_count ?? undefined,
      modelProvider: row.model_provider ?? undefined,
      estimatedCostUsd: row.estimated_cost_usd ?? undefined,
    }))
  );
}

async function getEventsForSummary(organizationId: string) {
  if (!isSupabasePersistenceConfigured()) {
    return getMemoryEvents().filter((event) => event.organizationId === organizationId);
  }

  return supabaseRestRequest<
    Array<{
      id: string;
      organization_id: string;
      event_type: MonitoringEventType;
      severity: MonitoringSeverity;
      source: string | null;
      route: string | null;
      message: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>
  >(
    `monitoring_events?${eqFilter('organization_id', organizationId)}&select=*&order=created_at.desc&limit=250`
  ).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      eventType: row.event_type,
      severity: row.severity,
      source: row.source ?? undefined,
      route: row.route ?? undefined,
      message: row.message,
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at,
    }))
  );
}

async function saveMonitoringEventToSupabase(record: MonitoringEventRecord) {
  if (!isSupabasePersistenceConfigured()) return;

  await ensureOrganization(record.organizationId);

  await supabaseRestRequest('monitoring_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      id: record.id,
      organization_id: record.organizationId,
      event_type: record.eventType,
      severity: record.severity,
      source: record.source ?? null,
      route: record.route ?? null,
      message: record.message,
      metadata: record.metadata ?? {},
      created_at: record.createdAt,
    }),
  });
}
