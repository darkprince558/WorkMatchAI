import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AuthContext } from '../lib/auth';
import type { ManagerPriorityMode } from '../lib/settings';
import type { TaskStatus } from '../lib/types';

const require = createRequire(import.meta.url);
const { applyWorkMatchMutation, getWorkMatchData } = require('../lib/db/workmatch-store.ts') as typeof import('../lib/db/workmatch-store');

type Row = Record<string, unknown>;

type RecordedRequest = {
  method: string;
  table: string;
  path: string;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
};

const originalFetch = globalThis.fetch;
const originalEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

describe('WorkMatch Supabase tenant isolation', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://tenant-isolation.supabase.local';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    globalThis.fetch = (async () => {
      throw new Error('Unexpected live fetch in tenant isolation test.');
    }) as typeof fetch;
  });

  afterEach(() => {
    restoreEnv('SUPABASE_URL', originalEnv.SUPABASE_URL);
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', originalEnv.NEXT_PUBLIC_SUPABASE_URL);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', originalEnv.SUPABASE_SERVICE_ROLE_KEY);
    globalThis.fetch = originalFetch;
  });

  it('loads only rows for the authenticated organization when external IDs collide', async () => {
    const supabase = new SupabaseRestMock();
    supabase.seed('employees', [employeeRow('org-a', 'Org A Engineer'), employeeRow('org-b', 'Org B Engineer')]);
    supabase.seed('tasks', [taskRow('org-a', 'Org A Task', 'Ready to Staff'), taskRow('org-b', 'Org B Task', 'At Risk')]);
    supabase.seed('assignments', [assignmentRow('org-a'), assignmentRow('org-b')]);
    supabase.seed('settings', [settingsRow('org-a', 'skills'), settingsRow('org-b', 'speed')]);
    installSupabaseMock(supabase);

    const snapshot = await getWorkMatchData(authContext('org-a'));

    assert.equal(snapshot.persistence.mode, 'supabase');
    assert.deepEqual(
      snapshot.employees.map((employee) => `${employee.id}:${employee.name}`),
      ['E-SHARED:Org A Engineer']
    );
    assert.deepEqual(
      snapshot.tasks.map((task) => `${task.id}:${task.name}:${task.status}`),
      ['T-SHARED:Org A Task:Ready to Staff']
    );
    assert.deepEqual(snapshot.tasks[0]?.assignedEmployeeIds, ['E-SHARED']);
    assert.equal(snapshot.settings.defaultManagerPriority, 'skills');

    const readRequests = supabase.requests.filter(
      (request) => request.method === 'GET' && ['employees', 'tasks', 'assignments', 'settings'].includes(request.table)
    );
    assert.equal(readRequests.length, 4);
    readRequests.forEach((request) => assertOrgFilter(request, 'org-a'));
  });

  it('mutates only the authenticated organization when task and employee IDs overlap', async () => {
    const supabase = new SupabaseRestMock();
    supabase.seed('employees', [employeeRow('org-a', 'Org A Engineer'), employeeRow('org-b', 'Org B Engineer')]);
    supabase.seed('tasks', [taskRow('org-a', 'Org A Task', 'Ready to Staff'), taskRow('org-b', 'Org B Task', 'Ready to Staff')]);
    supabase.seed('assignments', [assignmentRow('org-b', 'active', 12)]);
    supabase.seed('settings', [settingsRow('org-a', 'balanced'), settingsRow('org-b', 'growth')]);
    installSupabaseMock(supabase);

    await applyWorkMatchMutation(authContext('org-a'), {
      type: 'update_task_status',
      taskId: 'T-SHARED',
      status: 'At Risk',
    });
    await applyWorkMatchMutation(authContext('org-a'), {
      type: 'approve_assignment',
      taskId: 'T-SHARED',
      employeeId: 'E-SHARED',
      nextTaskStatus: 'In Progress',
      matchScore: 88,
      matchLabel: 'Strong',
    });

    assert.equal(findRow(supabase.rowsFor('tasks'), 'org-a', 'external_task_id', 'T-SHARED')?.status, 'In Progress');
    assert.equal(findRow(supabase.rowsFor('tasks'), 'org-b', 'external_task_id', 'T-SHARED')?.status, 'Ready to Staff');

    const orgAAssignment = findRow(supabase.rowsFor('assignments'), 'org-a', 'employee_id', 'E-SHARED');
    const orgBAssignment = findRow(supabase.rowsFor('assignments'), 'org-b', 'employee_id', 'E-SHARED');
    assert.equal(orgAAssignment?.match_score, 88);
    assert.equal(orgAAssignment?.match_label, 'Strong');
    assert.equal(orgBAssignment?.status, 'active');
    assert.equal(orgBAssignment?.match_score, 12);

    const taskPatchRequests = supabase.requests.filter((request) => request.method === 'PATCH' && request.table === 'tasks');
    assert.ok(taskPatchRequests.length >= 2);
    taskPatchRequests.forEach((request) => {
      assertOrgFilter(request, 'org-a');
      assert.equal(request.params.external_task_id, 'eq.T-SHARED');
    });

    const assignmentUpsert = supabase.requests.find((request) => request.method === 'POST' && request.table === 'assignments');
    assert.equal(assignmentUpsert?.params.on_conflict, 'organization_id,task_id,employee_id');
    assert.ok(
      supabase.rowsFor('audit_events').every((row) => row.organization_id === 'org-a'),
      'mutation audit rows should be written only for the authenticated organization'
    );
  });
});

class SupabaseRestMock {
  readonly requests: RecordedRequest[] = [];
  private readonly tables: Record<string, Row[]> = {};

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
    const table = url.pathname.split('/rest/v1/')[1];
    assert.ok(table, `Unexpected Supabase REST URL: ${url.toString()}`);

    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body = parseJsonBody(init.body);
    this.requests.push({
      method,
      table,
      path: `${table}${url.search}`,
      params: Object.fromEntries(url.searchParams.entries()),
      body,
      headers: Object.fromEntries(headers.entries()),
    });

    if (method === 'GET') {
      return jsonResponse(this.selectRows(table, url.searchParams));
    }

    if (method === 'PATCH') {
      this.patchRows(table, url.searchParams, body);
      return emptyResponse();
    }

    if (method === 'POST') {
      this.postRows(table, url.searchParams, body);
      return emptyResponse();
    }

    return new Response(`Unsupported method ${method}`, { status: 405 });
  };

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((row) => ({ ...row }));
  }

  rowsFor(table: string) {
    return this.tableRows(table);
  }

  private selectRows(table: string, params: URLSearchParams) {
    const rows = this.tableRows(table).filter((row) => matchesFilters(row, params)).map((row) => ({ ...row }));
    const limit = Number(params.get('limit'));
    return Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  }

  private patchRows(table: string, params: URLSearchParams, body: unknown) {
    assert.ok(isRow(body), `PATCH ${table} expected a JSON object body.`);
    this.tableRows(table).forEach((row) => {
      if (matchesFilters(row, params)) Object.assign(row, body);
    });
  }

  private postRows(table: string, params: URLSearchParams, body: unknown) {
    const rows = rowsFromBody(body);
    const conflictKeys = params.get('on_conflict')?.split(',').filter(Boolean) ?? [];
    rows.forEach((row) => {
      const targetRows = this.tableRows(table);
      const existing = conflictKeys.length
        ? targetRows.find((candidate) => conflictKeys.every((key) => candidate[key] === row[key]))
        : undefined;
      if (existing) {
        Object.assign(existing, row);
      } else {
        targetRows.push({ ...row });
      }
    });
  }

  private tableRows(table: string) {
    this.tables[table] ??= [];
    return this.tables[table];
  }
}

function matchesFilters(row: Row, params: URLSearchParams) {
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
    if (value.startsWith('in.(') && value.endsWith(')')) {
      const expectedValues = value.slice(4, -1).split(',');
      if (!expectedValues.includes(String(row[key]))) return false;
    }
  }
  return true;
}

function parseJsonBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string' || !body) return undefined;
  return JSON.parse(body) as unknown;
}

function rowsFromBody(body: unknown): Row[] {
  if (Array.isArray(body)) {
    body.forEach((row) => assert.ok(isRow(row), 'Supabase POST array entries must be objects.'));
    return body;
  }
  assert.ok(isRow(body), 'Supabase POST body must be an object or array.');
  return [body];
}

function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse() {
  return new Response(null, { status: 204 });
}

function installSupabaseMock(supabase: SupabaseRestMock) {
  globalThis.fetch = supabase.fetch as typeof fetch;
}

function authContext(organizationId: string): AuthContext {
  return {
    organizationId,
    userId: `${organizationId}-manager`,
    role: 'manager',
    email: `${organizationId}@workmatch.local`,
  };
}

function assertOrgFilter(request: RecordedRequest, organizationId: string) {
  assert.equal(request.params.organization_id, `eq.${organizationId}`, `${request.method} ${request.path} must include an organization_id filter.`);
}

function findRow(rows: Row[], organizationId: string, key: string, value: string) {
  return rows.find((row) => row.organization_id === organizationId && row[key] === value);
}

function employeeRow(organizationId: string, name: string): Row {
  return {
    id: `${organizationId}:employee:E-SHARED`,
    organization_id: organizationId,
    external_employee_id: 'E-SHARED',
    name,
    role: 'Platform Engineer',
    department: 'Engineering',
    location: 'Remote',
    timezone: null,
    availability_percent: 80,
    availability_status: 'Available',
    skills: [{ name: 'Supabase', rating: 8 }],
    years_experience: 7,
    readiness: 'Ready',
    avatar_url: null,
    interests: [],
    career_goals: null,
    certifications: [],
    past_projects: [],
    resume_file_name: null,
    resume_updated_at: null,
    resume_note: null,
    project_interests: [],
    is_active: true,
  };
}

function taskRow(organizationId: string, name: string, status: TaskStatus): Row {
  return {
    id: `${organizationId}:task:T-SHARED`,
    organization_id: organizationId,
    external_task_id: 'T-SHARED',
    name,
    type: 'Internal Work',
    description: 'Tenant isolation test task.',
    urgency: 'Medium',
    deadline_date: '2026-08-15',
    estimated_hours: 40,
    required_skills: [{ name: 'Supabase', minRating: 7, importance: 'critical' }],
    optional_skills: [],
    location: 'Remote',
    remote: true,
    team_size: 1,
    seniority: 'Senior',
    staffing_mode: 'One Employee',
    status,
    source_documents: [],
  };
}

function assignmentRow(organizationId: string, status = 'approved', matchScore: number | null = null): Row {
  return {
    id: `${organizationId}:assignment:T-SHARED:E-SHARED`,
    organization_id: organizationId,
    task_id: 'T-SHARED',
    employee_id: 'E-SHARED',
    status,
    source: 'manager',
    allocation_percent: 100,
    match_score: matchScore,
    match_label: null,
  };
}

function settingsRow(organizationId: string, defaultManagerPriority: ManagerPriorityMode): Row {
  return {
    id: `${organizationId}:settings`,
    organization_id: organizationId,
    scope: 'organization',
    key: 'workmatch_ui',
    value: {
      aiProvider: 'environment',
      defaultManagerPriority,
      importConfidenceThreshold: 85,
      requireReview: true,
      showAuditTrail: defaultManagerPriority !== 'speed',
      enabledDataSources: {
        csv: true,
        excel: true,
        pdf: true,
        word: true,
        microsoft365: false,
      },
    },
  };
}

function restoreEnv(key: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
