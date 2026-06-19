import type { AuthContext, WorkMatchRole } from './permissions';
import {
  AUTH_COOKIE_NAMES,
  AuthRequiredError,
  authContextFromSupabaseUser,
  getSupabaseUser,
  isSupabaseAuthConfigured,
  refreshSupabaseSession,
} from './supabase-auth';

const fallbackAuthContext: AuthContext = {
  userId: 'demo-manager',
  organizationId: 'demo-organization',
  role: 'manager',
  employeeId: 'E001',
  email: 'demo.manager@workmatch.local',
  name: 'Demo Manager',
};

export function getAuthContextFromRequest(request?: Request): AuthContext {
  return {
    userId: request?.headers.get('x-workmatch-user-id') || process.env.WORKMATCH_DEMO_USER_ID || fallbackAuthContext.userId,
    organizationId:
      request?.headers.get('x-workmatch-organization-id') ||
      process.env.WORKMATCH_DEMO_ORGANIZATION_ID ||
      fallbackAuthContext.organizationId,
    role: normalizeRole(request?.headers.get('x-workmatch-role') || process.env.WORKMATCH_DEMO_ROLE),
    employeeId:
      request?.headers.get('x-workmatch-employee-id') ||
      process.env.WORKMATCH_DEMO_EMPLOYEE_ID ||
      fallbackAuthContext.employeeId,
    email: request?.headers.get('x-workmatch-email') || process.env.WORKMATCH_DEMO_EMAIL || fallbackAuthContext.email,
    name: request?.headers.get('x-workmatch-name') || process.env.WORKMATCH_DEMO_NAME || fallbackAuthContext.name,
  };
}

export async function requireAuthContext(request: Request): Promise<AuthContext> {
  const accessToken = getRequestCookie(request, AUTH_COOKIE_NAMES.accessToken);
  const refreshToken = getRequestCookie(request, AUTH_COOKIE_NAMES.refreshToken);

  if (accessToken && isSupabaseAuthConfigured()) {
    const user = await getSupabaseUser(accessToken);
    const context = authContextFromSupabaseUser(user);
    return {
      userId: context.userId,
      organizationId: context.organizationId,
      role: context.role,
    };
  }

  if (refreshToken && isSupabaseAuthConfigured()) {
    const session = await refreshSupabaseSession(refreshToken);
    if (session.user) {
      const context = authContextFromSupabaseUser(session.user);
      return {
        userId: context.userId,
        organizationId: context.organizationId,
        role: context.role,
      };
    }
  }

  if (process.env.WORKMATCH_AUTH_MODE === 'demo') {
    return getAuthContextFromRequest(request);
  }

  throw new AuthRequiredError();
}

function normalizeRole(value?: string | null): WorkMatchRole {
  if (value === 'admin' || value === 'manager' || value === 'reviewer' || value === 'viewer' || value === 'agent_service') {
    return value;
  }

  return fallbackAuthContext.role;
}

function getRequestCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  if (!cookie) return undefined;
  return decodeURIComponent(cookie.slice(name.length + 1));
}
