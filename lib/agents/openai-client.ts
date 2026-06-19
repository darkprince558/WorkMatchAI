import type { AgentModelClient, AgentModelRequest, AgentModelUsage } from './requests';
import { toOpenAiTextFormat } from './schema-utils';

export interface OpenAiResponsesClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export type OpenAiUsage = AgentModelUsage;

export class OpenAiResponsesClient implements AgentModelClient {
  readonly provider = 'openai';
  readonly model: string;
  readonly baseUrl: string;
  lastUsage?: OpenAiUsage;
  lastModelVersion?: string;

  private readonly apiKey?: string;

  constructor(options: OpenAiResponsesClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.5';
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async generateStructured<TOutput>(request: AgentModelRequest<TOutput>): Promise<string | unknown> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured.');
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content: request.systemInstruction,
          },
          {
            role: 'user',
            content: request.userInstruction,
          },
        ],
        text: {
          format: toOpenAiTextFormat(request.agentName, request.responseSchema),
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenAiResponsePayload;
    this.lastUsage = extractUsage(payload);
    this.lastModelVersion = payload.model;

    if (!response.ok) {
      const message = payload.error?.message ?? `OpenAI request failed with ${response.status}.`;
      throw new Error(message);
    }

    return extractStructuredOutput(payload);
  }
}

type OpenAiResponsePayload = {
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      parsed?: unknown;
      refusal?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

function extractStructuredOutput(payload: OpenAiResponsePayload) {
  if (payload.output_text) return payload.output_text;

  for (const output of payload.output ?? []) {
    if (output.type !== 'message') continue;

    for (const item of output.content ?? []) {
      if (item.type === 'refusal') {
        throw new Error(item.refusal || 'The model refused to produce this structured output.');
      }

      if (item.parsed !== undefined) return item.parsed;
      if (item.type === 'output_text' && item.text) return item.text;
    }
  }

  throw new Error('OpenAI response did not include structured output text.');
}

function extractUsage(payload: OpenAiResponsePayload): OpenAiUsage | undefined {
  if (!payload.usage) return undefined;

  return {
    inputTokens: payload.usage.input_tokens,
    outputTokens: payload.usage.output_tokens,
    totalTokens: payload.usage.total_tokens,
  };
}
