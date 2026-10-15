import { describe, expect, it } from 'vitest';
import { alibabaTranscriptionCost, alibabaTranscriptionTokenRates } from './model-pricing';

describe('Alibaba transcription cost', () => {
  it('uses Singapore token prices by default', () => {
    expect(alibabaTranscriptionCost('ws-example.ap-southeast-1.maas.aliyuncs.com', 10_000, 1_500)).toBeCloseTo(0.01035);
  });

  it('uses Beijing token prices for Beijing workspaces', () => {
    expect(alibabaTranscriptionTokenRates('ws-example.cn-beijing.maas.aliyuncs.com')).toEqual({
      input: 0.848,
      output: 0.636,
      region: 'Pequim',
    });
    expect(alibabaTranscriptionCost('ws-example.cn-beijing.maas.aliyuncs.com', 10_000, 1_500)).toBeCloseTo(0.009434);
  });

  it('does not return a negative cost for invalid token counts', () => {
    expect(alibabaTranscriptionCost('', -10, Number.NaN)).toBeGreaterThanOrEqual(0);
  });
});
