export type ClientMonitoringEventInput = {
  eventType: 'parser_failure' | 'route_error' | 'persistence_write';
  severity?: 'info' | 'warning' | 'error';
  source?: string;
  route?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function recordMonitoringEvent(event: ClientMonitoringEventInput) {
  await fetch('/api/monitoring/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  }).catch(() => undefined);
}
