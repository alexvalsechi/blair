import { describe, expect, it } from 'vitest';
import { qwenInsightUpdate } from './insight-transcript';

describe('Qwen live insight context', () => {
  it('revises one live sentence until finalization and excludes it from previous speech', () => {
    const finalized = new Set<string>();
    const first = qwenInsightUpdate([], finalized, 1, 'Como', false, '2026-10-17T12:00:00.000Z');
    const revised = qwenInsightUpdate(first.segments, finalized, 1, 'Como inverter uma árvore?', false, '2026-10-17T12:00:01.000Z');
    const done = qwenInsightUpdate(revised.segments, finalized, 1, 'Como inverter uma árvore binária?', true, '2026-10-17T12:00:02.000Z');
    expect(done.segments).toHaveLength(1);
    expect(done.segments[0].createdAt).toBe(first.segments[0].createdAt);
    expect(revised.update.isFinal).toBe(false);
    expect(done.update).toMatchObject({ finalized: [], liveText: 'Como inverter uma árvore binária?', isFinal: true });
    const next = qwenInsightUpdate(done.segments, finalized, 2, 'Use recursão?', false, '2026-10-17T12:00:03.000Z');
    expect(next.update.finalized).toEqual(['Como inverter uma árvore binária?']);
  });

  it('keeps only the latest eight finished sentences', () => {
    const finalized = new Set<string>();
    let segments: ReturnType<typeof qwenInsightUpdate>['segments'] = [];
    for (let index = 1; index <= 10; index += 1) {
      segments = qwenInsightUpdate(segments, finalized, index, `Fala ${index}`, true, '2026-10-17T12:00:00.000Z').segments;
    }
    const update = qwenInsightUpdate(segments, finalized, 11, 'Pergunta atual?', false, '2026-10-17T12:00:00.000Z').update;
    expect(update.finalized).toEqual(Array.from({ length: 8 }, (_, index) => `Fala ${index + 3}`));
  });
});
