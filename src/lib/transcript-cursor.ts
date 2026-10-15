import type { TranscriptSegment } from '../../electron/contracts';

export function getUnanalyzedSegments(
  segments: readonly TranscriptSegment[],
  analyzed: ReadonlyMap<string, string>,
): TranscriptSegment[] {
  return segments.filter((segment) => analyzed.get(segment.id) !== segment.text);
}
