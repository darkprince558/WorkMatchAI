export function estimateModelCost(provider: string | undefined, inputTokens?: number, outputTokens?: number) {
  const prefix = provider === 'gemini' ? 'GEMINI' : provider === 'openai' ? 'OPENAI' : undefined;
  if (!prefix) return 0;

  const inputRate = readRate(`${prefix}_INPUT_COST_PER_1M_TOKENS`);
  const outputRate = readRate(`${prefix}_OUTPUT_COST_PER_1M_TOKENS`);
  return roundCurrency(((inputTokens ?? 0) / 1_000_000) * inputRate + ((outputTokens ?? 0) / 1_000_000) * outputRate);
}

export function estimateOpenAiCost(inputTokens?: number, outputTokens?: number) {
  return estimateModelCost('openai', inputTokens, outputTokens);
}

export function roundCurrency(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function readRate(envName: string) {
  const value = Number(process.env[envName] || 0);
  return Number.isFinite(value) ? value : 0;
}
