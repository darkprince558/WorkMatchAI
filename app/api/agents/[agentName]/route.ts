import { NextResponse } from 'next/server';
import { assertCanPerform } from '@/lib/auth';
import { getRouteAuthContext, readJsonBody, routeErrorResponse } from '@/lib/api/route-helpers';
import { checkRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { isRunnableAgentName, runWorkMatchAgent } from '@/lib/agents/run-agent';
import { getWorkMatchSettings } from '@/lib/db/workmatch-store';
import { recordMonitoringEvent } from '@/lib/monitoring/telemetry';

type RouteContext = {
  params: Promise<{
    agentName: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { agentName } = await context.params;
  if (!isRunnableAgentName(agentName)) {
    return NextResponse.json({ error: `Unknown WorkMatch agent: ${agentName}` }, { status: 404 });
  }

  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'agent_runs:create');
    assertCanPerform(auth, 'settings:read');

    const rateLimit = await checkRateLimit(`agent:${auth.organizationId}:${auth.userId}:${agentName}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

    const body = await readJsonBody(request, { maxBytes: 512 * 1024 });
    const settings = await getWorkMatchSettings(auth);
    const input = withAuthContext(body, auth.organizationId, auth.userId);
    const envelope = await runWorkMatchAgent(agentName, input, {
      organizationId: auth.organizationId,
      triggeredByUserId: auth.userId,
      aiProvider: settings.aiProvider,
    });

    return NextResponse.json(envelope);
  } catch (error) {
    if (error instanceof Error && (error.name === 'AuthorizationError' || error.name === 'HttpError')) {
      return routeErrorResponse(error, 'Agent route failed.');
    }

    await recordMonitoringEvent({
      organizationId: auth.organizationId,
      eventType: 'route_error',
      severity: 'error',
      route: `/api/agents/${agentName}`,
      message: error instanceof Error ? error.message : 'Unknown agent route error.',
    });
    return routeErrorResponse(error, 'Agent route failed.');
  }
}

function withAuthContext(value: unknown, organizationId: string, managerUserId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { organizationId, managerUserId, value };
  }

  return {
    ...value,
    organizationId,
    managerUserId,
  };
}
