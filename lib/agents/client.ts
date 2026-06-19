import type { AgentName, AgentOutputEnvelope } from './contracts';

export async function requestAgentOutput<TOutput>(
  agentName: AgentName,
  input: unknown,
  options: { signal?: AbortSignal } = {}
): Promise<AgentOutputEnvelope<TOutput>> {
  const response = await fetch(`/api/agents/${agentName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Agent request failed with status ${response.status}.`);
  }

  return (await response.json()) as AgentOutputEnvelope<TOutput>;
}
