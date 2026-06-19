import { NextResponse } from 'next/server';
import { assertCanPerform } from '@/lib/auth';
import { boundedString, getRouteAuthContext, HttpError, isPlainObject, readJsonObject, routeErrorResponse } from '@/lib/api/route-helpers';
import {
  MONITORING_EVENT_TYPES,
  MONITORING_SEVERITIES,
  recordMonitoringEvent,
  type MonitoringEventType,
  type MonitoringSeverity,
} from '@/lib/monitoring/telemetry';

export async function POST(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'imports:create');
    const body = await readJsonObject(request, { maxBytes: 64 * 1024 });
    const eventType = readMonitoringEventType(body.eventType);
    const severity = readMonitoringSeverity(body.severity);
    const message = boundedString(body.message, 'message', { maxLength: 600 });
    const metadata = readMetadata(body.metadata);

    await recordMonitoringEvent({
      organizationId: auth.organizationId,
      eventType,
      severity,
      source: boundedString(body.source, 'source', { maxLength: 160, required: false }),
      route: boundedString(body.route, 'route', { maxLength: 160, required: false }),
      message,
      metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error, 'Monitoring event could not be recorded.');
  }
}

function readMonitoringEventType(value: unknown): MonitoringEventType {
  if (typeof value !== 'string' || !MONITORING_EVENT_TYPES.includes(value as MonitoringEventType)) {
    throw new HttpError(400, 'eventType is invalid.');
  }
  return value as MonitoringEventType;
}

function readMonitoringSeverity(value: unknown): MonitoringSeverity | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !MONITORING_SEVERITIES.includes(value as MonitoringSeverity)) {
    throw new HttpError(400, 'severity is invalid.');
  }
  return value as MonitoringSeverity;
}

function readMetadata(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) throw new HttpError(400, 'metadata must be an object.');
  if (JSON.stringify(value).length > 16 * 1024) throw new HttpError(400, 'metadata is too large.');
  return value;
}
