import type { WorkMatchRole } from './permissions';

export const AUTH_COOKIE_NAMES = {
  accessToken: 'workmatch_access_token',
  refreshToken: 'workmatch_refresh_token',
} as const;

export type SupabaseAuthConfig = {
  url: string;
  anonKey: string;
};

export type SupabaseAuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: SupabaseAuthUser;
};

export type SupabaseAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export class AuthRequiredError extends Error {
  readonly status = 401;

  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class AuthConfigurationError extends Error {
  readonly status = 500;

  constructor(message = 'Supabase Auth is not configured.') {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

export class AuthProviderError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'AuthProviderError';
  }
}

export function getSupabaseAuthConfig(): SupabaseAuthConfig {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AuthConfigurationError('Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign in.');
  }

  return {
    url: url.replace(/\/$/, ''),
    anonKey,
  };
}

export function isSupabaseAuthConfigured() {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function signInWithPassword(input: { email: string; password: string }) {
  const config = getSupabaseAuthConfig();
  return supabaseAuthRequest<SupabaseAuthSession>(config, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
    },
  });
}

export async function signUpWithPassword(input: { email: string; password: string; fullName?: string }) {
  const config = getSupabaseAuthConfig();
  return supabaseAuthRequest<SupabaseAuthSession | { user?: SupabaseAuthUser; session?: SupabaseAuthSession }>(config, '/auth/v1/signup', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
      data: {
        full_name: input.fullName || input.email.split('@')[0],
      },
    },
  });
}

export async function refreshSupabaseSession(refreshToken: string) {
  const config = getSupabaseAuthConfig();
  return supabaseAuthRequest<SupabaseAuthSession>(config, '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: {
      refresh_token: refreshToken,
    },
  });
}

export async function getSupabaseUser(accessToken: string) {
  const config = getSupabaseAuthConfig();
  return supabaseAuthRequest<SupabaseAuthUser>(config, '/auth/v1/user', {
    method: 'GET',
    accessToken,
  });
}

export function normalizeSupabaseSession(value: SupabaseAuthSession | { user?: SupabaseAuthUser; session?: SupabaseAuthSession }) {
  if ('access_token' in value) return value;
  return value.session;
}

export function authContextFromSupabaseUser(user: SupabaseAuthUser) {
  const trustedMetadata = user.app_metadata ?? {};
  const displayMetadata = user.user_metadata ?? {};
  const organizationId = stringValue(trustedMetadata.organization_id);

  if (!organizationId) {
    throw new AuthProviderError('This account is not assigned to a WorkMatch organization.', 403);
  }

  return {
    userId: user.id,
    organizationId,
    role: roleValue(trustedMetadata.role),
    employeeId: stringValue(trustedMetadata.employee_id) || stringValue(trustedMetadata.employeeId),
    email: user.email,
    name: stringValue(displayMetadata.full_name) || stringValue(displayMetadata.name) || user.email || 'WorkMatch user',
  };
}

async function supabaseAuthRequest<TResponse>(
  config: SupabaseAuthConfig,
  path: string,
  options: {
    method: 'GET' | 'POST';
    body?: unknown;
    accessToken?: string;
  }
) {
  const response = await fetch(`${config.url}${path}`, {
    method: options.method,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${options.accessToken ?? config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as TResponse & {
    error?: string;
    error_description?: string;
    msg?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new AuthProviderError(
      payload.error_description || payload.message || payload.msg || payload.error || `Supabase Auth request failed with ${response.status}.`,
      response.status
    );
  }

  return payload as TResponse;
}

function roleValue(value: unknown): WorkMatchRole {
  if (value === 'admin' || value === 'manager' || value === 'reviewer' || value === 'viewer' || value === 'agent_service') return value;
  return 'viewer';
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
