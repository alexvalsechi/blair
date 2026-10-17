import { afterEach, describe, expect, it, vi } from 'vitest';
import { askJevNoul, boundedInsightInput, hasClearQuestion, insightThreshold, sameSuggestion } from './insight-service';

afterEach(() => vi.unstubAllGlobals());

describe('live insight decisions', () => {
  it('lowers the partial threshold for clear questions and keeps ambiguous partial speech strict', () => {
    expect(insightThreshold({ isFinal: false, liveText: 'Como faço isso?' })).toBe(0.7);
    expect(insightThreshold({ isFinal: false, liveText: 'A proposta usa um pipeline de dados' })).toBe(1.0);
    expect(insightThreshold({ isFinal: true, liveText: 'Como faço isso?' })).toBe(0.8);
    expect(insightThreshold({ isFinal: true, liveText: 'Você poderia me explicar como resolver esse problema no código que estamos analisando agora?' })).toBe(0.7);
  });

  it('bounds the context to the latest eight finalized segments and preserves the live utterance', () => {
    const input = boundedInsightInput({
      finalized: Array.from({ length: 12 }, (_, index) => `fala ${index}`),
      liveText: 'E a pergunta atual?', isFinal: false, segmentId: 'sentence-3', requestId: 'request-1', profileId: 'general', visibleSuggestion: 'Resposta anterior',
      answered: Array.from({ length: 6 }, (_, index) => ({ question: `pergunta ${index}`, answer: `resposta ${index}` })),
    });
    expect(input.finalized).toEqual(Array.from({ length: 8 }, (_, index) => `fala ${index + 4}`));
    expect(input.liveText).toBe('E a pergunta atual?');
    expect(input.visibleSuggestion).toBe('Resposta anterior');
    expect(input.requestId).toBe('request-1');
    expect(input.answered).toEqual([2, 3, 4, 5].map((index) => ({ question: `pergunta ${index}`, answer: `resposta ${index}` })));
  });

  it('keeps the local fallback conservative and recognizes exact paraphrase formatting', () => {
    expect(hasClearQuestion('Como eu posso montar a árvore?')).toBe(true);
    expect(hasClearQuestion('Essa é uma vez que você teve de conversar com produto ou diretoria')).toBe(true);
    expect(insightThreshold({ isFinal: false, liveText: 'Enfim, uma vez que você teve que convencer alguém de produto ou diretoria a aceitar uma decisão técnica difícil, tipo adiar uma feature por dívida técnica' })).toBe(0.7);
    expect(insightThreshold({ isFinal: false, liveText: 'Enfim, uma vez que você teve que convencer alguém de produto ou diretoria a aceitar uma decisão técnica difícil, como v' })).toBe(0.7);
    expect(insightThreshold({ isFinal: false, liveText: 'Se ele daria com um bug intermitente num job Spark em produção que só falha em determinados dias' })).toBe(0.75);
    expect(insightThreshold({ isFinal: false, liveText: 'Se ele daria com um bug intermitente num job Spark em produção que só falha em determinados dias, sem matar a SRA. Por onde começa aí' })).toBe(0.7);
    expect(hasClearQuestion('Mas acho que deveria seguir a parte técnica para uma abordagem X.')).toBe(true);
    expect(hasClearQuestion('A reunião começa em cinco minutos.')).toBe(false);
    expect(hasClearQuestion('Estamos montando a árvore agora.')).toBe(false);
    expect(sameSuggestion('Use uma árvore binária.', 'use uma arvore binaria')).toBe(true);
  });

  it('reads a typed Jev probability and rejects malformed answers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ answers: { decision: { type: 'noul', noul: 0.92 } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ answers: { decision: { type: 'choice', choice: 'yes' } } }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askJevNoul('secret', { current: 'Como?' }, 'É uma pergunta?')).toBe(0.92);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).questions.decision.type).toBe('noul');
    await expect(askJevNoul('secret', { current: 'Como?' }, 'É uma pergunta?')).rejects.toThrow('probabilidade válida');
  });

  it('reports a rejected TypeSafe key instead of treating it as a transient failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(askJevNoul('invalid', { current: 'Como faço isso?' }, 'É uma pergunta?')).rejects.toThrow('chave TypeSafe foi recusada');
  });
});
