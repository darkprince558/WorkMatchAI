import type { AuditEventInsert, AuditEventType, AuditTargetType, Json } from '../db/schema';

export const AUDIT_EVENT_TYPES = [
  'agent_run_started',
  'agent_run_completed',
  'fallback_used',
  'import_created',
  'import_record_reviewed',
  'import_confirmed',
  'employee_upserted',
  'task_upserted',
  'assignment_reviewed',
  'assignment_approved',
  'assignment_changed',
  'settings_changed',
  'manager_override_submitted',
] as const satisfies readonly AuditEventType[];

export function createAuditEvent(input: {
  organizationId: string;
  eventType: AuditEventType;
  targetType: AuditTargetType;
  targetId: string;
  actorType: AuditEventInsert['actor_type'];
  actorId?: string;
  managerUserId?: string;
  agentRunId?: string;
  reason?: string;
  beforeSnapshot?: Json;
  afterSnapshot?: Json;
  metadata?: Json;
  createdAt?: string;
}): AuditEventInsert {
  return {
    organization_id: input.organizationId,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    event_type: input.eventType,
    target_type: input.targetType,
    target_id: input.targetId,
    manager_user_id: input.managerUserId ?? null,
    agent_run_id: input.agentRunId ?? null,
    reason: input.reason ?? null,
    before_snapshot: input.beforeSnapshot ?? {},
    after_snapshot: input.afterSnapshot ?? {},
    metadata: input.metadata ?? {},
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

export function createManagerReviewAuditEvent(input: {
  organizationId: string;
  managerUserId: string;
  targetType: AuditTargetType;
  targetId: string;
  eventType: Extract<
    AuditEventType,
    'import_record_reviewed' | 'import_confirmed' | 'assignment_reviewed' | 'assignment_approved' | 'settings_changed'
  >;
  reason?: string;
  beforeSnapshot?: Json;
  afterSnapshot?: Json;
  metadata?: Json;
}): AuditEventInsert {
  return createAuditEvent({
    organizationId: input.organizationId,
    actorType: 'manager',
    actorId: input.managerUserId,
    managerUserId: input.managerUserId,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    metadata: input.metadata,
  });
}
