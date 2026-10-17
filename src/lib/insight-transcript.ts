import type { InsightTranscriptUpdate, TranscriptSegment } from '../../electron/contracts';

export function qwenInsightUpdate(
  segments: TranscriptSegment[], finalizedIds: Set<string>, sentenceId: number, text: string, sentenceEnd: boolean, createdAt: string,
): { segments: TranscriptSegment[]; update: InsightTranscriptUpdate } {
  const id = `alibaba-${sentenceId}`;
  const next = [...segments];
  const index = next.findIndex((item) => item.id === id);
  const segment: TranscriptSegment = { id, createdAt: index >= 0 ? next[index].createdAt : createdAt, source: 'mixed', text };
  if (index >= 0) next[index] = segment;
  else next.push(segment);
  if (sentenceEnd) finalizedIds.add(id);
  return {
    segments: next,
    update: {
      finalized: next.filter((item) => item.id !== id && finalizedIds.has(item.id)).slice(-8).map((item) => item.text),
      liveText: text,
      isFinal: sentenceEnd,
      segmentId: id,
    },
  };
}
