import { NextResponse } from 'next/server';
import { assertCanPerform } from '@/lib/auth';
import { getRouteAuthContext, routeErrorResponse } from '@/lib/api/route-helpers';
import { listAgentRunLogs } from '@/lib/db/agent-run-store';

export async function GET(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'agent_runs:read');

    const runs = await listAgentRunLogs(auth.organizationId);
    return NextResponse.json({
      runs: runs.slice(0, 50).map(({ envelope, ...record }) => ({
        ...record,
        envelope,
      })),
    });
  } catch (error) {
    return routeErrorResponse(error, 'Agent runs could not be loaded.');
  }
}
