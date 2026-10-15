import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '../../electron/contracts';
import { getUnanalyzedSegments } from './transcript-cursor';

const segment = (id: string, text: string): TranscriptSegment => ({
  id,
  text,
  createdAt: '2026-10-14T00:00:00.000Z',
  source: 'microphone',
});

describe('transcript analysis cursor', () => {
  it('returns only segments not covered by the previous analysis', () => {
    const segments = [segment('old', 'Já analisado'), segment('new', 'Trecho novo')];
    const analyzed = new Map([['old', 'Já analisado']]);

    expect(getUnanalyzedSegments(segments, analyzed)).toEqual([segment('new', 'Trecho novo')]);
  });

  it('reprocesses a live segment when its transcript changed after analysis', () => {
    const segments = [segment('live', 'Frase finalizada')];
    const analyzed = new Map([['live', 'Frase parcial']]);

    expect(getUnanalyzedSegments(segments, analyzed)).toEqual(segments);
  });
});
