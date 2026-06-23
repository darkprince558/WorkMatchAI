import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAuditEvent } from '../lib/audit/events';
import type { AuthContext } from '../lib/auth/permissions';
import { AGENT_WORKFLOW_VERSION, type AgentOutputEnvelope, type DashboardInsightsOutput } from '../lib/agents/contracts';
import { saveAgentRunLog } from '../lib/db/agent-run-store';
import { ensureOrganization } from '../lib/db/organizations';
import { eqFilter, isSupabasePersistenceConfigured, supabaseRestRequest } from '../lib/db/supabase-rest';
import { applyWorkMatchMutation, getWorkMatchData } from '../lib/db/workmatch-store';
import { recordMonitoringEvent } from '../lib/monitoring/telemetry';
import { initialWorkMatchSettings } from '../lib/settings';
import type { Employee, ImportReviewRecord, Task } from '../lib/types';
import { importRowsFromCsv } from '../lib/workmatch';

const dryRun = process.argv.includes('--dry-run');

loadEnvFiles(['.env.local', '.env']);

const auth: AuthContext = {
  organizationId: process.env.WORKMATCH_DEMO_ORGANIZATION_ID || process.env.WORKMATCH_DEFAULT_ORGANIZATION_ID || 'demo-organization',
  userId: process.env.WORKMATCH_DEMO_USER_ID || 'demo-manager',
  role: 'manager',
  email: process.env.WORKMATCH_DEMO_EMAIL || 'demo.manager@workmatch.local',
  name: process.env.WORKMATCH_DEMO_NAME || 'Demo Manager',
};

const seed = createSeedScenario();

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  if (dryRun) {
    assertSeedRecords(seed.records);
    console.log(`Supabase verification dry run prepared ${seed.records.length} records for ${auth.organizationId}.`);
    return;
  }

  if (!isSupabasePersistenceConfigured()) {
    throw new Error(
      'Supabase persistence is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY, then rerun npm run verify:supabase.'
    );
  }

  console.log(`Verifying Supabase persistence for organization ${auth.organizationId}...`);
  await ensureOrganization(auth.organizationId, 'WorkMatch Demo Organization');

  const importSnapshot = await applyWorkMatchMutation(auth, {
    type: 'commit_import',
    records: seed.records,
    sourceName: seed.sourceName,
  });
  assertSupabaseSnapshot(importSnapshot);

  await applyWorkMatchMutation(auth, {
    type: 'update_settings',
    settings: {
      ...initialWorkMatchSettings,
      defaultManagerPriority: 'skills',
      showAuditTrail: true,
    },
  });

  await applyWorkMatchMutation(auth, {
    type: 'approve_assignment',
    taskId: seed.taskId,
    employeeId: seed.employeeId,
    nextTaskStatus: 'In Progress',
    matchScore: 88,
    matchLabel: 'Strong',
  });

  const monitoringEvent = await recordMonitoringEvent({
    organizationId: auth.organizationId,
    eventType: 'persistence_write',
    severity: 'info',
    source: 'verify-supabase-mode',
    message: 'Supabase verification wrote demo seed records.',
    metadata: { employeeId: seed.employeeId, taskId: seed.taskId, sourceName: seed.sourceName },
  });
  const agentRunId = `verify-${Date.now()}`;
  await saveAgentRunLog({
    id: agentRunId,
    organizationId: auth.organizationId,
    agentName: 'dashboard_insights',
    status: 'fallback',
    startedAt: seed.startedAt,
    completedAt: new Date().toISOString(),
    triggeredByUserId: auth.userId,
    inputHash: seed.inputHash,
    inputSummary: 'Supabase verification seeded demo organization.',
    outputSummary: 'Verification run completed with deterministic fallback output.',
    modelProvider: 'verification',
    modelName: 'deterministic-seed',
    promptVersion: 'verify-supabase-mode-v1',
    toolCallCount: 0,
    fallbackUsed: true,
    deterministicScoreUsed: false,
    envelope: createAgentEnvelope(agentRunId),
  });

  await assertSupabaseRows(seed, monitoringEvent.id, agentRunId);

  const finalSnapshot = await getWorkMatchData(auth);
  assertSupabaseSnapshot(finalSnapshot);
  assertHasSeededData(finalSnapshot.employees, finalSnapshot.tasks, seed);
  console.log('Supabase verification passed: demo organization, data, assignment, settings, audit, agent run, and monitoring rows round-tripped.');
}

function createSeedScenario() {
  const startedAt = new Date().toISOString();
  const employeeId = 'E-DEMO-VERIFY';
  const taskId = 'T-DEMO-VERIFY';
  const sourceName = `supabase-demo-seed-${startedAt.slice(0, 10)}.csv`;
  const employeeCsv = [
    'employee_id,name,role,department,location,availability_status,capacity_percent,years_experience,skills,certifications,past_projects,interests,career_goals',
    `${employeeId},Demo Verification Lead,Platform Engineer,Engineering,Remote,Available,80,7,"React:8|Supabase:8|Auditability:7","Security+","WorkMatch Persistence","Durable SaaS","Keep the demo organization healthy"`,
  ].join('\n');
  const taskCsv = [
    'task_id,name,type,description,required_skills,optional_skills,urgency,deadline,estimated_hours,team_size,location,remote_status,seniority_required,staffing_mode,status',
    `${taskId},Demo Supabase Verification,Internal Work,"Verify seeded durable persistence across WorkMatch tables.","Supabase:7:critical|Auditability:6:high","React:5",Medium,2026-08-15,40,1,Remote,Remote,Senior,One Employee,Ready to Staff`,
  ].join('\n');
  const records = [...importRowsFromCsv(employeeCsv, sourceName, 'employee'), ...importRowsFromCsv(taskCsv, sourceName, 'task')].map((record) => ({
    ...record,
    reviewStatus: 'Confirmed' as const,
  }));

  return {
    employeeId,
    taskId,
    sourceName,
    records,
    startedAt,
    inputHash: `verify-${auth.organizationId}-${startedAt}`,
  };
}

function assertSeedRecords(records: ImportReviewRecord[]) {
  if (records.length !== 2) throw new Error(`Expected 2 seed records, found ${records.length}.`);
  if (!records.some((record) => record.type === 'employee')) throw new Error('Seed scenario is missing an employee record.');
  if (!records.some((record) => record.type === 'task')) throw new Error('Seed scenario is missing a task record.');
}

function assertSupabaseSnapshot(snapshot: { persistence: { mode: string; configured: boolean } }) {
  if (snapshot.persistence.mode !== 'supabase' || !snapshot.persistence.configured) {
    throw new Error(`Expected Supabase persistence mode, received ${snapshot.persistence.mode}.`);
  }
}

function assertHasSeededData(employees: Employee[], tasks: Task[], scenario: ReturnType<typeof createSeedScenario>) {
  if (!employees.some((employee) => employee.id === scenario.employeeId)) {
    throw new Error(`Seeded employee ${scenario.employeeId} was not returned by getWorkMatchData.`);
  }
  const task = tasks.find((item) => item.id === scenario.taskId);
  if (!task) throw new Error(`Seeded task ${scenario.taskId} was not returned by getWorkMatchData.`);
  if (!task.assignedEmployeeIds?.includes(scenario.employeeId)) {
    throw new Error(`Seeded assignment ${scenario.taskId}/${scenario.employeeId} was not returned by getWorkMatchData.`);
  }
}

async function assertSupabaseRows(scenario: ReturnType<typeof createSeedScenario>, monitoringEventId: string, agentRunId: string) {
  await assertExists('employees', `external_employee_id=${scenario.employeeId}`, async () =>
    supabaseRestRequest<unknown[]>(
      `employees?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('external_employee_id', scenario.employeeId)}&select=id&limit=1`
    )
  );
  await assertExists('tasks', `external_task_id=${scenario.taskId}`, async () =>
    supabaseRestRequest<unknown[]>(
      `tasks?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('external_task_id', scenario.taskId)}&select=id&limit=1`
    )
  );
  await assertExists('assignments', `${scenario.taskId}/${scenario.employeeId}`, async () =>
    supabaseRestRequest<unknown[]>(
      `assignments?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('task_id', scenario.taskId)}&${eqFilter('employee_id', scenario.employeeId)}&select=id&limit=1`
    )
  );
  await assertExists('imports', scenario.sourceName, async () =>
    supabaseRestRequest<unknown[]>(
      `imports?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('source_name', scenario.sourceName)}&select=id&limit=1`
    )
  );
  await assertExists('settings', 'workmatch_ui', async () =>
    supabaseRestRequest<unknown[]>(
      `settings?${eqFilter('organization_id', auth.organizationId)}&scope=eq.organization&key=eq.workmatch_ui&select=id&limit=1`
    )
  );
  await assertExists('audit_events', 'import_confirmed', async () =>
    supabaseRestRequest<unknown[]>(
      `audit_events?${eqFilter('organization_id', auth.organizationId)}&event_type=eq.import_confirmed&target_type=eq.import&select=id&limit=1`
    )
  );
  await assertExists('agent_runs', agentRunId, async () =>
    supabaseRestRequest<unknown[]>(
      `agent_runs?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('id', agentRunId)}&select=id&limit=1`
    )
  );
  await assertExists('monitoring_events', monitoringEventId, async () =>
    supabaseRestRequest<unknown[]>(
      `monitoring_events?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('id', monitoringEventId)}&select=id&limit=1`
    )
  );
}

async function assertExists(label: string, target: string, query: () => Promise<unknown[]>) {
  const rows = await query();
  if (!rows.length) throw new Error(`Supabase verification failed: ${label} row for ${target} was not found.`);
}

function createAgentEnvelope(agentRunId: string): AgentOutputEnvelope<DashboardInsightsOutput> {
  return {
    agentRunId,
    agentName: 'dashboard_insights',
    workflowVersion: AGENT_WORKFLOW_VERSION,
    status: 'fallback',
    generatedAt: new Date().toISOString(),
    inputRefs: [{ sourceType: 'sample_data', sourceId: 'supabase-demo-seed', recordId: auth.organizationId }],
    output: {
      snapshotId: 'supabase-verification',
      insights: [],
    },
    warnings: [
      {
        code: 'verification_seed',
        severity: 'info',
        message: 'Deterministic verification record used to prove Supabase persistence.',
      },
    ],
    review: [],
    audit: {
      modelProvider: 'verification',
      modelName: 'deterministic-seed',
      promptVersion: 'verify-supabase-mode-v1',
      toolCallCount: 0,
      fallbackUsed: true,
      deterministicScoreUsed: false,
      reviewedByManager: false,
    },
  };
}

function loadEnvFiles(files: string[]) {
  files.forEach((file) => {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) return;

    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || process.env[match[1]] !== undefined) return;
        process.env[match[1]] = unquoteEnvValue(match[2]);
      });
  });
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
