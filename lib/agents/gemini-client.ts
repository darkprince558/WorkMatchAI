import { GoogleGenAI } from '@google/genai';
import type { AgentModelClient, AgentModelRequest, AgentModelUsage } from './requests';

export interface GeminiGenerateContentClientOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiGenerateContentClient implements AgentModelClient {
  readonly provider = 'gemini';
  readonly model: string;
  lastUsage?: AgentModelUsage;
  lastModelVersion?: string;

  private readonly apiKey?: string;

  constructor(options: GeminiGenerateContentClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = options.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async generateStructured<TOutput>(request: AgentModelRequest<TOutput>): Promise<string | unknown> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: request.userInstruction,
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: request.responseMimeType,
        responseJsonSchema: request.responseSchema,
        temperature: 0.2,
      },
    });

    this.lastUsage = {
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      totalTokens: response.usageMetadata?.totalTokenCount,
    };
    this.lastModelVersion = response.modelVersion;

    if (response.promptFeedback?.blockReason) {
      const reason = String(response.promptFeedback.blockReason);
      throw new Error(response.promptFeedback.blockReasonMessage ?? `Gemini blocked the prompt: ${reason}.`);
    }

    if (!response.text) {
      throw new Error('Gemini response did not include structured output text.');
    }

    return response.text;
  }
}
