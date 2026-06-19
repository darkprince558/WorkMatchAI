import type { AiProviderId, AiProviderSetting } from '@/lib/settings';
import { GeminiGenerateContentClient } from './gemini-client';
import { OpenAiResponsesClient } from './openai-client';
import type { AgentModelClient, AgentModelUsage } from './requests';

export type AiProvider = AiProviderId;

export interface AgentRuntimeClient extends AgentModelClient {
  readonly provider: AiProvider;
  readonly model: string;
  readonly configured: boolean;
  readonly lastUsage?: AgentModelUsage;
  readonly lastModelVersion?: string;
}

export interface AgentModelClientOptions {
  provider?: AiProviderSetting;
}

export interface AgentModelClientStatus {
  provider: AiProvider;
  model: string;
  configured: boolean;
}

export function createAgentModelClient(options: AgentModelClientOptions = {}): AgentRuntimeClient {
  const provider = resolveAiProvider(options.provider);
  if (provider === 'gemini') return new GeminiGenerateContentClient();
  return new OpenAiResponsesClient();
}

export function getAgentModelClientStatus(provider?: AiProviderSetting): AgentModelClientStatus {
  const client = createAgentModelClient({ provider });
  return {
    provider: client.provider,
    model: client.model,
    configured: client.configured,
  };
}

export function resolveAiProvider(provider?: AiProviderSetting): AiProvider {
  const selected = provider && provider !== 'environment' ? provider : process.env.AI_PROVIDER;
  if (selected === 'gemini' || selected === 'openai') return selected;
  return 'openai';
}
