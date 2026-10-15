type TokenPrice = { input: number; output: number };

const tokenPrices: Record<string, TokenPrice> = {
  'gpt-6-astra': { input: 10, output: 50 },
  'gpt-6.1-sol': { input: 2, output: 10 },
  'gpt-6-sol': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5.6-sol': { input: 4, output: 20 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-cyber': { input: 12.5, output: 75 },
  'gpt-5.3-codex': { input: 1.75, output: 14 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  o3: { input: 2, output: 8 },
  'o4-mini': { input: 1.1, output: 4.4 },
};

const transcriptionPerMinute: Record<string, number> = {
  'gpt-4o-transcribe': 0.006,
  'gpt-4o-mini-transcribe': 0.003,
  'gpt-transcribe': 0.0045,
  'gpt-realtime-whisper': 0.017,
  'gpt-live-transcribe': 0.017,
};

function baseModelId(modelId: string): string {
  return modelId.toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

function findPrice<T>(modelId: string, prices: Record<string, T>): T | undefined {
  const id = baseModelId(modelId);
  return prices[id] ?? Object.entries(prices).find(([name]) => id.startsWith(`${name}-`))?.[1];
}

const usd = (amount: number) => `$${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;

export function analysisModelPrice(modelId: string): string {
  const price = findPrice(modelId, tokenPrices);
  return price
    ? `Entrada ${usd(price.input)} · saída ${usd(price.output)} / 1M tokens`
    : 'Preço não mapeado · consulte a tabela OpenAI';
}

export function transcriptionModelPrice(modelId: string): string {
  const price = findPrice(modelId, transcriptionPerMinute);
  if (price !== undefined) return `${usd(price * 30 * 2)} para 30 min (2 fontes de áudio)`;
  const tokens = findPrice(modelId, tokenPrices);
  return tokens
    ? `Áudio: ${usd(tokens.input)} entrada · ${usd(tokens.output)} saída / 1M tokens`
    : 'Preço não mapeado · consulte a tabela OpenAI';
}
