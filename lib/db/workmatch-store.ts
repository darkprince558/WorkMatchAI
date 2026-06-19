import crypto from 'node:crypto';
import { createAuditEvent, createManagerReviewAuditEvent } from '@/lib/audit';
import { initialWorkMatchSettings, type WorkMatchSettings } from '@/lib/settings';
import type { AuthContext } from '@/lib/auth';
import { mockEmployees, mockTasks } from '@/lib/mock-data';
import type { Employee, ImportReviewRecord, ImportReviewStatus, MatchLabel, Task, TaskStatus, WorkMatchDocument } from '@/lib/types';
import type { WorkMatchDataMutation, WorkMatchDataSnapshot } from '@/lib/workmatch-data';
import { upsertEmployees, upsertTasks } from '@/lib/workmatch';
import { ensureOrganization } from './organizations';
import { eqFilter, isSupabasePersistenceConfigured, supabaseRestRequest } from './supabase-rest';

type EmployeeDbRow = {
  id: string;
  organization_id: string;
  external_employee_id: string | null;
  name: string;
  role: string;
  department: string;
  location: string;
  timezone: string | null;
  availability_percent: number;
  availability_status: Employee['availabilityStatus'] | null;
  skills: Employee['skills'];
  years_experience: number;
  readiness: Employee['readiness'];
  avatar_url: string | null;
  interests: string[] | null;
  career_goals: string | null;
  certifications: string[] | null;
  past_projects: string[] | null;
  resume_file_name: string | null;
  resume_updated_at: string | null;
  resume_note: string | null;
  project_interests: string[] | null;
  is_active: boolean;
};

type TaskDbRow = {
  id: string;
  organization_id: string;
  external_task_id: string | null;
  name: string;
  type: string | null;
  description: string | null;
  urgency: Task['urgency'];
  deadline_date: string;
  estimated_hours: number;
  required_skills: NonNullable<Task['requiredSkillSpecs']>;
  optional_skills: NonNullable<Task['optionalSkillSpecs']>;
  location: string;
  remote: boolean;
  team_size: number;
  seniority: string | null;
  staffing_mode: string;
  status: TaskStatus;
  source_documents: NonNullable<Task['sourceDocuments']> | null;
};

type AssignmentDbRow = {
  id: string;
  organization_id: string;
  task_id: string;
  employee_id: string;
  status: 'proposed' | 'pending_review' | 'approved' | 'rejected' | 'active' | 'completed' | 'cancelled';
  source: 'manager' | 'match_recommendation' | 'roster_import' | 'system';
  allocation_percent: number;
  match_score: number | null;
  match_label: MatchLabel | null;
};

type SettingsDbRow = {
  id: string;
  organization_id: string;
  scope: string;
  key: string;
  value: WorkMatchSettings;
};

type WorkMatchMemoryGlobal = typeof globalThis & {
  __workmatchData?: {
    employees: Employee[];
    tasks: Task[];
    settings: WorkMatchSettings;
  };
};

export async function getWorkMatchData(auth: AuthContext): Promise<WorkMatchDataSnapshot> {
  if (!isSupabasePersistenceConfigured()) {
    const memory = getMemoryStore();
    return snapshot(memory.employees, memory.tasks, normalizeSettings(memory.settings), 'memory', false);
  }

  const [employeeRows, taskRows, assignmentRows, settingRows] = await Promise.all([
    supabaseRestRequest<EmployeeDbRow[]>(
      `employees?${eqFilter('organization_id', auth.organizationId)}&is_active=eq.true&select=*&order=name.asc`
    ),
    supabaseRestRequest<TaskDbRow[]>(`tasks?${eqFilter('organization_id', auth.organizationId)}&select=*&order=deadline_date.asc`),
    supabaseRestRequest<AssignmentDbRow[]>(
      `assignments?${eqFilter('organization_id', auth.organizationId)}&status=in.(approved,active,pending_review)&select=*`
    ),
    supabaseRestRequest<SettingsDbRow[]>(
      `settings?${eqFilter('organization_id', auth.organizationId)}&scope=eq.organization&key=eq.workmatch_ui&select=*&limit=1`
    ),
  ]);

  const assignmentsByTask = groupAssignmentsByTask(assignmentRows);
  const settings = normalizeSettings(settingRows[0]?.value);
  return snapshot(
    employeeRows.map(rowToEmployee),
    taskRows.map((row) => rowToTask(row, assignmentsByTask.get(row.external_task_id ?? row.id) ?? [])),
    settings,
    'supabase',
    true
  );
}

export async function getWorkMatchSettings(auth: AuthContext): Promise<WorkMatchSettings> {
  if (!isSupabasePersistenceConfigured()) {
    return normalizeSettings(getMemoryStore().settings);
  }

  const rows = await supabaseRestRequest<SettingsDbRow[]>(
    `settings?${eqFilter('organization_id', auth.organizationId)}&scope=eq.organization&key=eq.workmatch_ui&select=*&limit=1`
  );
  return normalizeSettings(rows[0]?.value);
}

export async function applyWorkMatchMutation(auth: AuthContext, mutation: WorkMatchDataMutation): Promise<WorkMatchDataSnapshot> {
  if (!isSupabasePersistenceConfigured()) {
    applyMemoryMutation(mutation);
    const memory = getMemoryStore();
    return snapshot(memory.employees, memory.tasks, normalizeSettings(memory.settings), 'memory', false);
  }

  await ensureOrganization(auth.organizationId);

  switch (mutation.type) {
    case 'commit_import':
      await commitImportToSupabase(auth, mutation.records, mutation.sourceName);
      return mergeCommittedImportDocuments(await getWorkMatchData(auth), mutation.records);
    case 'update_task_status':
      await updateTaskStatusInSupabase(auth, mutation.taskId, mutation.status);
      break;
    case 'approve_assignment':
      await approveAssignmentInSupabase(auth, mutation);
      break;
    case 'approve_assignments':
      await approveAssignmentsInSupabase(auth, mutation);
      break;
    case 'update_employee_profile':
      await updateEmployeeProfileInSupabase(auth, mutation.employeeId, mutation.employee);
      break;
    case 'update_settings':
      await updateSettingsInSupabase(auth, mutation.settings);
      break;
  }

  return getWorkMatchData(auth);
}

function mergeCommittedImportDocuments(snapshot: WorkMatchDataSnapshot, records: ImportReviewRecord[]): WorkMatchDataSnapshot {
  const importedTasks = records.filter((record) => record.type === 'task').map((record) => record.entity as Task);
  if (!importedTasks.length) return snapshot;

  return {
    ...snapshot,
    tasks: upsertTasks(snapshot.tasks, importedTasks),
  };
}

function getMemoryStore() {
  const workMatchGlobal = globalThis as WorkMatchMemoryGlobal;
  workMatchGlobal.__workmatchData ??= {
    employees: [...mockEmployees],
    tasks: [...mockTasks],
    settings: initialWorkMatchSettings,
  };
  return workMatchGlobal.__workmatchData;
}

function applyMemoryMutation(mutation: WorkMatchDataMutation) {
  const memory = getMemoryStore();

  switch (mutation.type) {
    case 'commit_import': {
      const employees = mutation.records.filter((record) => record.type === 'employee').map((record) => record.entity as Employee);
      const tasks = mutation.records.filter((record) => record.type === 'task').map((record) => record.entity as Task);
      memory.employees = upsertEmployees(memory.employees, employees);
      memory.tasks = upsertTasks(memory.tasks, tasks);
      return;
    }
    case 'update_task_status':
      memory.tasks = memory.tasks.map((task) => (task.id === mutation.taskId ? { ...task, status: mutation.status } : task));
      return;
    case 'approve_assignment':
      memory.tasks = memory.tasks.map((task) => {
        if (task.id !== mutation.taskId) return task;
        const assignedEmployeeIds = Array.from(new Set([...(task.assignedEmployeeIds ?? []), mutation.employeeId])).slice(0, task.teamSize);
        return { ...task, assignedEmployeeIds, status: mutation.nextTaskStatus };
      });
      return;
    case 'approve_assignments':
      memory.tasks = memory.tasks.map((task) => {
        if (task.id !== mutation.taskId) return task;
        const assignedEmployeeIds = Array.from(new Set([...(task.assignedEmployeeIds ?? []), ...mutation.employeeIds])).slice(0, task.teamSize);
        return { ...task, assignedEmployeeIds, status: mutation.nextTaskStatus };
      });
      return;
    case 'update_employee_profile':
      memory.employees = memory.employees.map((employee) =>
        employee.id === mutation.employeeId ? { ...mutation.employee, id: mutation.employeeId } : employee
      );
      return;
    case 'update_settings':
      memory.settings = normalizeSettings(mutation.settings);
      return;
  }
}

async function commitImportToSupabase(auth: AuthContext, records: ImportReviewRecord[], sourceName = 'manager import') {
  if (!records.length) return;

  const importId = crypto.randomUUID();
  const employeeRecords = records.filter((record) => record.type === 'employee');
  const taskRecords = records.filter((record) => record.type === 'task');
  const now = new Date().toISOString();

  await supabaseRestRequest('imports', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      id: importId,
      organization_id: auth.organizationId,
      source_type: sourceTypeFromName(sourceName),
      source_name: sourceName,
      target: inferImportTarget(records),
      status: 'confirmed',
      review_required: true,
      confidence_threshold: 0.85,
      row_count: records.length,
      confirmed_count: records.filter((record) => record.reviewStatus === 'Confirmed').length,
      rejected_count: 0,
      triggered_by_user_id: auth.userId,
      completed_at: now,
    }),
  });

  await insertRows(
    'imported_records',
    records.map((record, index) => ({
      id: crypto.randomUUID(),
      organization_id: auth.organizationId,
      import_id: importId,
      record_type: record.type,
      review_status: reviewStatusToDb(record.reviewStatus),
      confidence: record.confidence / 100,
      issues: record.issues,
      source_refs: [{ sourceType: 'upload', sourceId: record.sourceFile, recordId: record.id, row: index + 1 }],
      source_row_number: index + 1,
      source_sheet: null,
      raw_payload: redactImportRecordForStorage(record),
      normalized_payload: redactEntityForStorage(record.entity),
      duplicate_candidates: [],
      reviewer_user_id: auth.userId,
      reviewed_at: now,
      creates_record_id: record.entity.id,
    }))
  );

  await Promise.all([
    upsertRows(
      'employees',
      employeeRecords.map((record) => employeeToRow(record.entity as Employee, auth)),
      'organization_id,external_employee_id'
    ),
    upsertRows(
      'tasks',
      taskRecords.map((record) => taskToRow(record.entity as Task, auth)),
      'organization_id,external_task_id'
    ),
    insertRows('audit_events', [
      createAuditEvent({
        organizationId: auth.organizationId,
        actorType: 'manager',
        actorId: auth.userId,
        managerUserId: auth.userId,
        eventType: 'import_confirmed',
        targetType: 'import',
        targetId: importId,
        afterSnapshot: { sourceName, recordCount: records.length },
      }),
      ...employeeRecords.map((record) =>
        createAuditEvent({
          organizationId: auth.organizationId,
          actorType: 'manager',
          actorId: auth.userId,
          managerUserId: auth.userId,
          eventType: 'employee_upserted',
          targetType: 'employee',
          targetId: record.entity.id,
          afterSnapshot: redactEntityForStorage(record.entity) as never,
        })
      ),
      ...taskRecords.map((record) =>
        createAuditEvent({
          organizationId: auth.organizationId,
          actorType: 'manager',
          actorId: auth.userId,
          managerUserId: auth.userId,
          eventType: 'task_upserted',
          targetType: 'task',
          targetId: record.entity.id,
          afterSnapshot: redactEntityForStorage(record.entity) as never,
        })
      ),
    ]),
  ]);
}

async function updateTaskStatusInSupabase(auth: AuthContext, taskId: string, status: TaskStatus) {
  await supabaseRestRequest(`tasks?${eqFilter('organization_id', auth.organizationId)}&${eqFilter('external_task_id', taskId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status,
      updated_by_user_id: auth.userId,
      updated_at: new Date().toISOString(),
    }),
  });

  await insertRows('audit_events', [
    createAuditEvent({
      organizationId: auth.organizationId,
      actorType: 'manager',
      actorId: auth.userId,
      managerUserId: auth.userId,
      eventType: 'assignment_changed',
      targetType: 'task',
      targetId: taskId,
      afterSnapshot: { status },
    }),
  ]);
}

async function approveAssignmentInSupabase(
  auth: AuthContext,
  mutation: Extract<WorkMatchDataMutation, { type: 'approve_assignment' }>
) {
  const now = new Date().toISOString();
  await upsertRows(
    'assignments',
    [
      {
        id: stableAssignmentId(auth.organizationId, mutation.taskId, mutation.employeeId),
        organization_id: auth.organizationId,
        task_id: mutation.taskId,
        employee_id: mutation.employeeId,
        status: 'approved',
        source: 'match_recommendation',
        allocation_percent: 100,
        match_score: mutation.matchScore ?? null,
        match_label: mutation.matchLabel ?? null,
        reviewed_by_user_id: auth.userId,
        approved_at: now,
        updated_by_user_id: auth.userId,
        updated_at: now,
      },
    ],
    'organization_id,task_id,employee_id'
  );

  await updateTaskStatusInSupabase(auth, mutation.taskId, mutation.nextTaskStatus);
  await insertRows('audit_events', [
    createManagerReviewAuditEvent({
      organizationId: auth.organizationId,
      managerUserId: auth.userId,
      eventType: 'assignment_approved',
      targetType: 'assignment',
      targetId: stableAssignmentId(auth.organizationId, mutation.taskId, mutation.employeeId),
      afterSnapshot: {
        taskId: mutation.taskId,
        employeeId: mutation.employeeId,
        status: 'approved',
      },
    }),
  ]);
}

async function approveAssignmentsInSupabase(
  auth: AuthContext,
  mutation: Extract<WorkMatchDataMutation, { type: 'approve_assignments' }>
) {
  const now = new Date().toISOString();
  const employeeIds = Array.from(new Set(mutation.employeeIds)).filter(Boolean);
  if (!employeeIds.length) return;

  await upsertRows(
    'assignments',
    employeeIds.map((employeeId) => ({
      id: stableAssignmentId(auth.organizationId, mutation.taskId, employeeId),
      organization_id: auth.organizationId,
      task_id: mutation.taskId,
      employee_id: employeeId,
      status: 'approved',
      source: 'match_recommendation',
      allocation_percent: Math.max(1, Math.round(100 / employeeIds.length)),
      match_score: null,
      match_label: null,
      reviewed_by_user_id: auth.userId,
      approved_at: now,
      updated_by_user_id: auth.userId,
      updated_at: now,
    })),
    'organization_id,task_id,employee_id'
  );

  await updateTaskStatusInSupabase(auth, mutation.taskId, mutation.nextTaskStatus);
  await insertRows(
    'audit_events',
    employeeIds.map((employeeId) =>
      createManagerReviewAuditEvent({
        organizationId: auth.organizationId,
        managerUserId: auth.userId,
        eventType: 'assignment_approved',
        targetType: 'assignment',
        targetId: stableAssignmentId(auth.organizationId, mutation.taskId, employeeId),
        afterSnapshot: {
          taskId: mutation.taskId,
          employeeId,
          status: 'approved',
          approvedAsBatch: true,
        },
      })
    )
  );
}

async function updateEmployeeProfileInSupabase(auth: AuthContext, employeeId: string, employee: Employee) {
  const nextEmployee = { ...employee, id: employeeId };
  await upsertRows('employees', [employeeToRow(nextEmployee, auth)], 'organization_id,external_employee_id');

  await insertRows('audit_events', [
    createAuditEvent({
      organizationId: auth.organizationId,
      actorType: 'manager',
      actorId: auth.userId,
      managerUserId: auth.userId,
      eventType: 'employee_upserted',
      targetType: 'employee',
      targetId: employeeId,
      afterSnapshot: redactEntityForStorage(nextEmployee) as never,
      metadata: { source: 'employee_self_service' },
    }),
  ]);
}

async function updateSettingsInSupabase(auth: AuthContext, settings: WorkMatchSettings) {
  const normalizedSettings = normalizeSettings(settings);
  await upsertRows(
    'settings',
    [
      {
        id: stableSettingsId(auth.organizationId),
        organization_id: auth.organizationId,
        scope: 'organization',
        team_id: null,
        user_id: null,
        key: 'workmatch_ui',
        value: normalizedSettings,
        schema_version: 1,
        updated_by_user_id: auth.userId,
        updated_at: new Date().toISOString(),
      },
    ],
    'organization_id,scope,key'
  );

  await insertRows('audit_events', [
    createManagerReviewAuditEvent({
      organizationId: auth.organizationId,
      managerUserId: auth.userId,
      eventType: 'settings_changed',
      targetType: 'settings',
      targetId: 'workmatch_ui',
      afterSnapshot: normalizedSettings as never,
    }),
  ]);
}

async function upsertRows(table: string, rows: unknown[], onConflict: string) {
  if (!rows.length) return;
  await supabaseRestRequest(`${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify(rows),
  });
}

async function insertRows(table: string, rows: unknown[]) {
  if (!rows.length) return;
  await supabaseRestRequest(table, {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(rows),
  });
}

function snapshot(
  employees: Employee[],
  tasks: Task[],
  settings: WorkMatchSettings,
  mode: WorkMatchDataSnapshot['persistence']['mode'],
  configured: boolean
): WorkMatchDataSnapshot {
  return {
    employees,
    tasks,
    settings,
    persistence: {
      mode,
      configured,
      message: configured
        ? 'Durable workspace storage is active for employees, tasks, assignments, imports, and settings.'
        : 'Workspace changes are retained for this local session.',
    },
  };
}

function employeeToRow(employee: Employee, auth: AuthContext) {
  return {
    organization_id: auth.organizationId,
    external_employee_id: employee.id,
    name: employee.name,
    role: employee.role,
    department: employee.department,
    location: employee.location,
    timezone: employee.timezone ?? null,
    availability_percent: employee.availability,
    availability_status: employee.availabilityStatus ?? availabilityStatus(employee.availability),
    skills: employee.skills,
    years_experience: employee.yearsExp,
    readiness: employee.readiness,
    avatar_url: employee.avatar,
    interests: employee.interests ?? [],
    career_goals: employee.careerGoals ?? null,
    certifications: employee.certifications ?? [],
    past_projects: employee.pastProjects ?? [],
    resume_file_name: employee.resume?.fileName ?? null,
    resume_updated_at: employee.resume?.updatedAt ?? null,
    resume_note: employee.resume?.note ?? null,
    project_interests: employee.projectInterests ?? [],
    is_active: true,
    updated_by_user_id: auth.userId,
  };
}

function taskToRow(task: Task, auth: AuthContext) {
  return {
    organization_id: auth.organizationId,
    external_task_id: task.id,
    name: task.name,
    type: task.type ?? null,
    description: task.description ?? null,
    urgency: task.urgency,
    deadline_date: task.deadline,
    estimated_hours: task.estHours,
    required_skills: task.requiredSkillSpecs?.length
      ? task.requiredSkillSpecs
      : task.requiredSkills.map((name) => ({ name, importance: 'medium' })),
    optional_skills: task.optionalSkillSpecs?.length ? task.optionalSkillSpecs : task.optionalSkills.map((name) => ({ name })),
    location: task.location,
    remote: task.remote,
    team_size: task.teamSize,
    seniority: task.seniority ?? null,
    staffing_mode: task.staffingMode ?? (task.teamSize > 1 ? 'Team' : 'One Employee'),
    status: task.status,
    source_documents: task.sourceDocuments?.flatMap((document) => {
      const redacted = redactDocumentForStorage(document);
      return redacted ? [redacted] : [];
    }) ?? [],
    updated_by_user_id: auth.userId,
  };
}

function rowToEmployee(row: EmployeeDbRow): Employee {
  return {
    id: row.external_employee_id ?? row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    location: row.location,
    timezone: row.timezone ?? undefined,
    availability: row.availability_percent,
    availabilityStatus: row.availability_status ?? availabilityStatus(row.availability_percent),
    skills: row.skills ?? [],
    yearsExp: row.years_experience,
    readiness: row.readiness,
    avatar: row.avatar_url ?? `https://picsum.photos/seed/${encodeURIComponent(row.name)}/200/200`,
    interests: row.interests ?? [],
    careerGoals: row.career_goals ?? undefined,
    certifications: row.certifications ?? [],
    pastProjects: row.past_projects ?? [],
    resume: row.resume_file_name
      ? {
          fileName: row.resume_file_name,
          updatedAt: row.resume_updated_at ?? new Date().toISOString(),
          note: row.resume_note ?? undefined,
        }
      : undefined,
    projectInterests: row.project_interests ?? [],
  };
}

function rowToTask(row: TaskDbRow, assignments: AssignmentDbRow[]): Task {
  const requiredSkillSpecs = row.required_skills ?? [];
  const optionalSkillSpecs = row.optional_skills ?? [];

  return {
    id: row.external_task_id ?? row.id,
    name: row.name,
    type: row.type ?? undefined,
    description: row.description ?? undefined,
    urgency: row.urgency,
    deadline: row.deadline_date,
    estHours: row.estimated_hours,
    requiredSkills: requiredSkillSpecs.map((skill) => skill.name),
    optionalSkills: optionalSkillSpecs.map((skill) => skill.name),
    requiredSkillSpecs,
    optionalSkillSpecs,
    location: row.location,
    remote: row.remote,
    teamSize: row.team_size,
    seniority: row.seniority ?? undefined,
    staffingMode: row.staffing_mode,
    status: row.status,
    assignedEmployeeIds: assignments.map((assignment) => assignment.employee_id),
    sourceDocuments: row.source_documents ?? [],
  };
}

function groupAssignmentsByTask(rows: AssignmentDbRow[]) {
  const map = new Map<string, AssignmentDbRow[]>();
  rows.forEach((row) => {
    map.set(row.task_id, [...(map.get(row.task_id) ?? []), row]);
  });
  return map;
}

function availabilityStatus(availability: number): Employee['availabilityStatus'] {
  if (availability >= 65) return 'Available';
  if (availability >= 30) return 'Partial';
  return 'Busy';
}

function reviewStatusToDb(status: ImportReviewStatus) {
  if (status === 'Confirmed') return 'confirmed';
  if (status === 'Needs Correction') return 'needs_correction';
  return 'needs_review';
}

function inferImportTarget(records: ImportReviewRecord[]) {
  const hasEmployees = records.some((record) => record.type === 'employee');
  const hasTasks = records.some((record) => record.type === 'task');
  if (hasEmployees && hasTasks) return 'auto';
  if (hasEmployees) return 'employee';
  return 'task';
}

function sourceTypeFromName(sourceName: string) {
  const extension = sourceName.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return 'csv';
  if (extension === 'xls' || extension === 'xlsx' || extension === 'xlsm') return 'excel';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'doc' || extension === 'docx') return 'word';
  return 'manual';
}

function stableAssignmentId(organizationId: string, taskId: string, employeeId: string) {
  return crypto.createHash('sha256').update(`${organizationId}:assignment:${taskId}:${employeeId}`).digest('hex');
}

function stableSettingsId(organizationId: string) {
  return crypto.createHash('sha256').update(`${organizationId}:settings:workmatch_ui`).digest('hex');
}

function normalizeSettings(settings: Partial<WorkMatchSettings> | undefined): WorkMatchSettings {
  return {
    ...initialWorkMatchSettings,
    ...(settings ?? {}),
    enabledDataSources: {
      ...initialWorkMatchSettings.enabledDataSources,
      ...(settings?.enabledDataSources ?? {}),
    },
  };
}

function redactImportRecordForStorage(record: ImportReviewRecord): ImportReviewRecord {
  return {
    ...record,
    entity: redactEntityForStorage(record.entity),
    sourceDocument: redactDocumentForStorage(record.sourceDocument),
  };
}

function redactEntityForStorage<T extends Employee | Task>(entity: T): T {
  if ('sourceDocuments' in entity && entity.sourceDocuments?.length) {
    return {
      ...entity,
      sourceDocuments: entity.sourceDocuments.map(redactDocumentForStorage),
    };
  }

  return entity;
}

function redactDocumentForStorage(document: ImportReviewRecord['sourceDocument'] | WorkMatchDocument) {
  if (!document) return undefined;
  const { dataUrl, ...metadata } = document;
  return dataUrl ? { ...metadata, note: metadata.note ?? 'Document bytes are stored in the browser vault and redacted from server persistence.' } : metadata;
}
