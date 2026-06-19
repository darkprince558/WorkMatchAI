import { NextResponse } from 'next/server';
import { assertCanPerform } from '@/lib/auth';
import { getRouteAuthContext, routeErrorResponse } from '@/lib/api/route-helpers';
import { getWorkMatchSettings } from '@/lib/db/workmatch-store';
import { getMonitoringSummary, recordMonitoringEvent } from '@/lib/monitoring/telemetry';

export async function GET(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'audit:read');
    const settings = await getWorkMatchSettings(auth);
    return NextResponse.json(await getMonitoringSummary(auth.organizationId, settings.aiProvider));
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthorizationError') {
      return routeErrorResponse(error, 'Monitoring summary could not be loaded.');
    }

    await recordMonitoringEvent({
      organizationId: auth.organizationId,
      eventType: 'route_error',
      severity: 'error',
      route: '/api/monitoring/summary',
      message: error instanceof Error ? error.message : 'Unknown monitoring summary error.',
    });
    return routeErrorResponse(error, 'Monitoring summary could not be loaded.');
  }
}
