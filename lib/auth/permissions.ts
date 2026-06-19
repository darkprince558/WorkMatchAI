export type WorkMatchRole = 'admin' | 'manager' | 'reviewer' | 'viewer' | 'agent_service';

export type WorkMatchPermission =
  | 'employees:read'
  | 'employees:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'imports:create'
  | 'imports:review'
  | 'assignments:propose'
  | 'assignments:approve'
  | 'settings:read'
  | 'settings:write'
  | 'audit:read'
  | 'agent_runs:create'
  | 'agent_runs:read';

export type AuthContext = {
  userId: string;
  organizationId: string;
  role: WorkMatchRole;
  employeeId?: string;
  email?: string;
  name?: string;
};

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export const ROLE_PERMISSIONS: Record<WorkMatchRole, readonly WorkMatchPermission[]> = {
  admin: [
    'employees:read',
    'employees:write',
    'tasks:read',
    'tasks:write',
    'imports:create',
    'imports:review',
    'assignments:propose',
    'assignments:approve',
    'settings:read',
    'settings:write',
    'audit:read',
    'agent_runs:create',
    'agent_runs:read',
  ],
  manager: [
    'employees:read',
    'employees:write',
    'tasks:read',
    'tasks:write',
    'imports:create',
    'imports:review',
    'assignments:propose',
    'assignments:approve',
    'settings:read',
    'settings:write',
    'audit:read',
    'agent_runs:create',
    'agent_runs:read',
  ],
  reviewer: [
    'employees:read',
    'tasks:read',
    'imports:create',
    'imports:review',
    'assignments:propose',
    'settings:read',
    'audit:read',
    'agent_runs:read',
  ],
  viewer: ['employees:read', 'tasks:read', 'settings:read', 'agent_runs:read'],
  agent_service: ['employees:read', 'tasks:read', 'imports:create', 'assignments:propose', 'agent_runs:create', 'agent_runs:read'],
};

export function canPerform(role: WorkMatchRole, permission: WorkMatchPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertCanPerform(context: AuthContext, permission: WorkMatchPermission): void {
  if (!canPerform(context.role, permission)) {
    throw new AuthorizationError();
  }
}

export function canApproveAuthoritativeWrite(context: AuthContext): boolean {
  return canPerform(context.role, 'imports:review') || canPerform(context.role, 'assignments:approve');
}
