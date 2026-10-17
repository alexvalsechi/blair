import { afterEach, describe, expect, it, vi } from 'vitest';
import { askJevNoul, boundedInsightInput, hasClearQuestion, insightThreshold, sameSuggestion } from './insight-service';

afterEach(() => vi.unstubAllGlobals());

describe('live insight decisions', () => {
  it('uses stricter thresholds for live and short finalized speech', () => {
    expect(insightThreshold({ isFinal: false, liveText: 'Como faço isso?' })).toBe(0.9);
    expect(insightThreshold({ isFinal: true, liveText: 'Como faço isso?' })).toBe(0.8);
    expect(insightThreshold({ isFinal: true, liveText: 'Você poderia me explicar como resolver esse problema no código que estamos analisando agora?' })).toBe(0.7);
  });

  it('bounds the context to the latest eight finalized segments and preserves the live utterance', () => {
    const input = boundedInsightInput({
      finalized: Array.from({ length: 12 }, (_, index) => `fala ${index}`),
      liveText: 'E a pergunta atual?', isFinal: false, segmentId: 'sentence-3', profileId: 'general', visibleSuggestion: 'Resposta anterior',
    });
    expect(input.finalized).toEqual(Array.from({ length: 8 }, (_, index) => `fala ${index + 4}`));
    expect(input.liveText).toBe('E a pergunta atual?');
    expect(input.visibleSuggestion).toBe('Resposta anterior');
  });

  it('keeps the local fallback conservative and recognizes exact paraphrase formatting', () => {
    expect(hasClearQuestion('Como eu posso montar a árvore?')).toBe(true);
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
