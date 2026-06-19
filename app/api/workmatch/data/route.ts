import { NextResponse } from 'next/server';
import { assertCanPerform, type WorkMatchPermission } from '@/lib/auth';
import { boundedString, getRouteAuthContext, HttpError, isPlainObject, readJsonBody, routeErrorResponse } from '@/lib/api/route-helpers';
import { applyWorkMatchMutation, getWorkMatchData } from '@/lib/db/workmatch-store';
import type { WorkMatchDataMutation } from '@/lib/workmatch-data';
import type { MatchLabel, TaskStatus } from '@/lib/types';
import { recordMonitoringEvent } from '@/lib/monitoring/telemetry';

const taskStatuses = new Set<TaskStatus>(['New', 'Needs Review', 'Ready to Staff', 'In Progress', 'At Risk']);
const matchLabels = new Set<MatchLabel>(['Perfect', 'Strong', 'Good', 'Growth', 'Risky', 'Not Recommended']);

export async function GET(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'employees:read');
    assertCanPerform(auth, 'tasks:read');
    assertCanPerform(auth, 'settings:read');
    return NextResponse.json(await getWorkMatchData(auth));
  } catch (error) {
    if (!(error instanceof Error) || error.name === 'AuthorizationError') {
      return routeErrorResponse(error, 'WorkMatch data could not be loaded.');
    }

    await recordMonitoringEvent({
      organizationId: auth.organizationId,
      eventType: 'route_error',
      severity: 'error',
      route: '/api/workmatch/data',
      message: error instanceof Error ? error.message : 'Unknown WorkMatch data load error.',
    });
    return routeErrorResponse(error, 'WorkMatch data could not be loaded.');
  }
}

export async function PATCH(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const mutation = parseWorkMatchMutation(await readJsonBody(request, { maxBytes: 512 * 1024 }));
    requiredPermissions(mutation).forEach((permission) => assertCanPerform(auth, permission));
    const result = await applyWorkMatchMutation(auth, mutation);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError || (error instanceof Error && error.name === 'AuthorizationError')) {
      return routeErrorResponse(error, 'WorkMatch change could not be saved.');
    }

    await recordMonitoringEvent({
      organizationId: auth.organizationId,
      eventType: 'route_error',
      severity: 'error',
      route: '/api/workmatch/data',
      message: error instanceof Error ? error.message : 'Unknown WorkMatch mutation error.',
    });
    return routeErrorResponse(error, 'WorkMatch change could not be saved.');
  }
}

function requiredPermissions(mutation: WorkMatchDataMutation): WorkMatchPermission[] {
  switch (mutation.type) {
    case 'commit_import':
      return ['imports:create', 'imports:review', 'employees:write', 'tasks:write'];
    case 'update_task_status':
      return ['tasks:write'];
    case 'approve_assignment':
    case 'approve_assignments':
      return ['assignments:approve'];
    case 'update_employee_profile':
      return ['employees:write'];
    case 'update_settings':
      return ['settings:write'];
    default:
      throw new HttpError(400, 'Unsupported WorkMatch mutation type.');
  }
}

function parseWorkMatchMutation(value: unknown): WorkMatchDataMutation {
  if (!isPlainObject(value)) throw new HttpError(400, 'Mutation body must be a JSON object.');

  switch (value.type) {
    case 'commit_import':
      return {
        type: 'commit_import',
        records: readImportRecords(value.records),
        sourceName: boundedString(value.sourceName, 'sourceName', { maxLength: 256, required: false }),
      };
    case 'update_task_status':
      return {
        type: 'update_task_status',
        taskId: boundedString(value.taskId, 'taskId', { maxLength: 128 }),
        status: readTaskStatus(value.status, 'status'),
      };
    case 'approve_assignment':
      return {
        type: 'approve_assignment',
        taskId: boundedString(value.taskId, 'taskId', { maxLength: 128 }),
        employeeId: boundedString(value.employeeId, 'employeeId', { maxLength: 128 }),
        nextTaskStatus: readTaskStatus(value.nextTaskStatus, 'nextTaskStatus'),
        matchScore: readOptionalScore(value.matchScore),
        matchLabel: readOptionalMatchLabel(value.matchLabel),
      };
    case 'approve_assignments':
      return {
        type: 'approve_assignments',
        taskId: boundedString(value.taskId, 'taskId', { maxLength: 128 }),
        employeeIds: readStringArray(value.employeeIds, 'employeeIds', 50),
        nextTaskStatus: readTaskStatus(value.nextTaskStatus, 'nextTaskStatus'),
      };
    case 'update_employee_profile':
      if (!isPlainObject(value.employee)) throw new HttpError(400, 'employee must be an object.');
      return {
        type: 'update_employee_profile',
        employeeId: boundedString(value.employeeId, 'employeeId', { maxLength: 128 }),
        employee: sanitizeEntityPayload(value.employee) as never,
      };
    case 'update_settings':
      if (!isPlainObject(value.settings)) throw new HttpError(400, 'settings must be an object.');
      return {
        type: 'update_settings',
        settings: value.settings as never,
      };
    default:
      throw new HttpError(400, 'Unsupported WorkMatch mutation type.');
  }
}

function readImportRecords(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError(400, 'records must be an array.');
  if (value.length > 500) throw new HttpError(400, 'A single import commit can include at most 500 records.');
  return value.map((record, index) => {
    if (!isPlainObject(record)) throw new HttpError(400, `records[${index}] must be an object.`);
    if (record.type !== 'employee' && record.type !== 'task') {
      throw new HttpError(400, `records[${index}].type must be employee or task.`);
    }
    if (!isPlainObject(record.entity)) throw new HttpError(400, `records[${index}].entity must be an object.`);

    return {
      ...record,
      entity: sanitizeEntityPayload(record.entity),
      sourceDocument: isPlainObject(record.sourceDocument) ? sanitizeDocumentPayload(record.sourceDocument) : undefined,
    };
  }) as never;
}

function sanitizeEntityPayload(entity: Record<string, unknown>) {
  const next = { ...entity };
  if (Array.isArray(next.sourceDocuments)) {
    next.sourceDocuments = next.sourceDocuments
      .filter(isPlainObject)
      .map((document) => sanitizeDocumentPayload(document));
  }
  return next;
}

function sanitizeDocumentPayload(document: Record<string, unknown>) {
  const { dataUrl, ...metadata } = document;
  return {
    ...metadata,
    note:
      typeof metadata.note === 'string' && metadata.note.trim()
        ? metadata.note
        : dataUrl
          ? 'Document bytes are stored in the browser vault and redacted from server requests.'
          : metadata.note,
  };
}

function readTaskStatus(value: unknown, field: string): TaskStatus {
  if (typeof value !== 'string' || !taskStatuses.has(value as TaskStatus)) {
    throw new HttpError(400, `${field} must be a valid task status.`);
  }
  return value as TaskStatus;
}

function readOptionalScore(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, 'matchScore must be a number.');
  return Math.min(100, Math.max(0, value));
}

function readOptionalMatchLabel(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !matchLabels.has(value as MatchLabel)) {
    throw new HttpError(400, 'matchLabel must be a valid match label.');
  }
  return value as MatchLabel;
}

function readStringArray(value: unknown, field: string, maxItems: number) {
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be an array.`);
  if (value.length > maxItems) throw new HttpError(400, `${field} can include at most ${maxItems} items.`);
  return value.map((item, index) => boundedString(item, `${field}[${index}]`, { maxLength: 128 }));
}
