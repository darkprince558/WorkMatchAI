import { isSupabasePersistenceConfigured, supabaseRestRequest } from './supabase-rest';

export async function ensureOrganization(organizationId: string, name = 'WorkMatch Organization') {
  if (!isSupabasePersistenceConfigured()) return;

  await supabaseRestRequest('organizations?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify([
      {
        id: organizationId,
        name,
      },
    ]),
  });
}
