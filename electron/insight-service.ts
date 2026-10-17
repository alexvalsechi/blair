import type { InsightInput } from './contracts.js';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

export class JevAuthenticationError extends Error {}

export function insightThreshold(input: Pick<InsightInput, 'isFinal' | 'liveText'>): number {
  if (!input.isFinal) {
    if (hasClearQuestion(input.liveText)) return 0.7;
    if (input.liveText.trim().split(/\s+/u).length >= 12) return 0.75;
    return 1.0;
  }
  return input.liveText.trim().split(/\s+/u).length >= 12 ? 0.7 : 0.8;
}

export function hasClearQuestion(text: string): boolean {
  const value = text.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clearRequest = /[?？]/u.test(value)
    || /^(?:como|qual|quais|quando|onde|por que|porque|sera que|voce (?:pode|sabe|consegue)|poderia|me (?:ajuda|explica|diz))\b/u.test(value)
    // Entrevistas costumam formular o pedido como um relato (“conte uma vez…”) em vez de uma pergunta direta.
    || /\b(?:uma vez que voce|me conta(?:r)?|conte(?:-me)?|descreva|fale sobre|como voce|como v(?:o|\b)|por onde|qual (?:e|foi|seria)|que voce teve que)\b/u.test(value);
  const actionableProposal = /\b(?:acho|acredito|penso) que (?:deveria|deveriamos|devemos|seria melhor|a melhor opcao)|\b(?:deveria|deveriamos|devemos) (?:seguir|usar|adotar|escolher|implementar|preferir)|\b(?:sugiro|recomendo|prefiro) (?:seguir|usar|adotar|escolher|implementar|a abordagem|essa abordagem)|\b(?:abordagem|arquitetura|solucao) tecnica\b/u.test(value);
  return value.length >= 12 && (clearRequest || actionableProposal);
}

export function sameSuggestion(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return normalize(a) === normalize(b);
}

export function hasDistinctQuestionIntent(current: string, answeredQuestions: string[]): boolean {
  const intentGroups = [
    /\b(?:comunic|stakeholder|trade.?off|avis|report|relat|document)\w*/u,
    /\b(?:metric|indicador|kpi|mediu|medir|mensur|impact)\w*/u,
    /\b(?:diagnostic|investig|identific|causa raiz|root cause|por onde comec)\w*/u,
    /\b(?:resolver|corrig|consert|mitig|repar|implementar|solucion|plano de correc)\w*/u,
    /\b(?:prioriz|criterio|decid|escolh|alinh)\w*/u,
    /\b(?:evit|preven|recorrenc|regress|garant)\w*/u,
    /\b(?:arquitet|desenh|abordag|estrutur)\w*/u,
  ];
  const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const currentIntents = intentGroups.flatMap((pattern, index) => pattern.test(normalize(current)) ? [index] : []);
  if (!currentIntents.length) return false;
  const answeredIntents = new Set(answeredQuestions.flatMap((question) => intentGroups.flatMap((pattern, index) => pattern.test(normalize(question)) ? [index] : [])));
  return currentIntents.some((intent) => !answeredIntents.has(intent));
}

export function boundedInsightInput(value: unknown): InsightInput {
  if (!value || typeof value !== 'object') throw new Error('Recorte de insight inválido.');
  const input = value as Partial<InsightInput>;
  if (!Array.isArray(input.finalized) || !Array.isArray(input.answered) || typeof input.liveText !== 'string' || typeof input.segmentId !== 'string' || typeof input.requestId !== 'string' || typeof input.profileId !== 'string' || typeof input.visibleSuggestion !== 'string' || typeof input.isFinal !== 'boolean') {
    throw new Error('Recorte de insight inválido.');
  }
  return {
    finalized: input.finalized.filter((item): item is string => typeof item === 'string').slice(-8).map((item) => item.trim().slice(0, 500)),
    liveText: input.liveText.trim().slice(0, 900),
    isFinal: input.isFinal,
    segmentId: input.segmentId.slice(0, 100),
    requestId: input.requestId.slice(0, 100),
    profileId: input.profileId.slice(0, 100),
    visibleSuggestion: input.visibleSuggestion.trim().slice(0, 600),
    answered: input.answered.filter((item): item is { question: string; answer: string } => Boolean(item) && typeof item.question === 'string' && typeof item.answer === 'string').slice(-4).map((item) => ({ question: item.question.trim().slice(0, 500), answer: item.answer.trim().slice(0, 600) })),
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
