export interface SupabaseRestConfig {
  url: string;
  serviceRoleKey: string;
}

export function getSupabaseRestConfig(): SupabaseRestConfig | undefined {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return undefined;

  return {
    url: url.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

export function isSupabasePersistenceConfigured() {
  return Boolean(getSupabaseRestConfig());
}

export async function supabaseRestRequest<TResponse>(
  path: string,
  init: RequestInit & { prefer?: string } = {}
): Promise<TResponse> {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error('Supabase persistence is not configured.');
  }

  const headers = new Headers(init.headers);
  headers.set('apikey', config.serviceRoleKey);
  headers.set('Authorization', `Bearer ${config.serviceRoleKey}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (init.prefer) headers.set('Prefer', init.prefer);

  const response = await fetch(`${config.url}/rest/v1/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Supabase REST ${response.status}: ${details || response.statusText}`);
  }

  if (response.status === 204) return undefined as TResponse;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as TResponse;
}

export function eqFilter(column: string, value: string) {
  return `${column}=eq.${encodeURIComponent(value)}`;
}
