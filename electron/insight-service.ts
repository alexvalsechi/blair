import type { InsightInput } from './contracts.js';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

export class JevAuthenticationError extends Error {}

export function insightThreshold(input: Pick<InsightInput, 'isFinal' | 'liveText'>): number {
  if (!input.isFinal) return 0.9;
  return input.liveText.trim().split(/\s+/u).length >= 12 ? 0.7 : 0.8;
}

export function hasClearQuestion(text: string): boolean {
  const value = text.trim().toLocaleLowerCase('pt-BR');
  const clearRequest = /[?？]/u.test(value) || /^(?:como|qual|quais|quando|onde|por que|porque|será que|você (?:pode|sabe|consegue)|poderia|me (?:ajuda|explica|diz))\b/u.test(value);
  const actionableProposal = /\b(?:acho|acredito|penso) que (?:deveria|deveríamos|devemos|seria melhor|a melhor opção)|\b(?:deveria|deveríamos|devemos) (?:seguir|usar|adotar|escolher|implementar|preferir)|\b(?:sugiro|recomendo|prefiro) (?:seguir|usar|adotar|escolher|implementar|a abordagem|essa abordagem)|\b(?:abordagem|arquitetura|solução) técnica\b/u.test(value);
  return value.length >= 12 && (clearRequest || actionableProposal);
}

export function sameSuggestion(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return normalize(a) === normalize(b);
}

export function boundedInsightInput(value: unknown): InsightInput {
  if (!value || typeof value !== 'object') throw new Error('Recorte de insight inválido.');
  const input = value as Partial<InsightInput>;
  if (!Array.isArray(input.finalized) || typeof input.liveText !== 'string' || typeof input.segmentId !== 'string' || typeof input.profileId !== 'string' || typeof input.visibleSuggestion !== 'string' || typeof input.isFinal !== 'boolean') {
    throw new Error('Recorte de insight inválido.');
  }
  return {
    finalized: input.finalized.filter((item): item is string => typeof item === 'string').slice(-8).map((item) => item.trim().slice(0, 500)),
    liveText: input.liveText.trim().slice(0, 900),
    isFinal: input.isFinal,
    segmentId: input.segmentId.slice(0, 100),
    profileId: input.profileId.slice(0, 100),
    visibleSuggestion: input.visibleSuggestion.trim().slice(0, 600),
  };
}

export async function askJevNoul(apiKey: string, state: object, instructions: string, signal?: AbortSignal): Promise<number> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 3_500);
  try {
    const response = await fetch(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state, questions: { decision: { type: 'noul', instructions } } }),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) throw new JevAuthenticationError('A chave TypeSafe foi recusada. Atualize-a em Conexão.');
    if (!response.ok) throw new Error(`TypeSafe retornou HTTP ${response.status}.`);
    const body = await response.json() as { answers?: { decision?: { type?: string; noul?: number } } };
    const probability = body.answers?.decision?.noul;
    if (body.answers?.decision?.type !== 'noul' || typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error('A resposta do Jev não contém uma probabilidade válida.');
    }
    return probability;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
