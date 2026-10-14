import { describe, expect, it } from 'vitest';
import { D2 } from '@terrastruct/d2';
import { svgToDataUrl } from './AnswerContent';

describe('D2 answer rendering', () => {
  it('renders an S3 to Delta Lake medallion architecture as SVG', async () => {
    const renderer = new D2();
    const source = [
      's3: "Amazon S3" {shape: cylinder}',
      'auto_loader: "Auto Loader"',
      'bronze: "Bronze - Delta Lake"',
      'silver: "Silver - Delta Lake"',
      'gold: "Gold - Delta Lake"',
      's3 -> auto_loader -> bronze -> silver -> gold',
    ].join('\n');
    const compiled = await renderer.compile({
      fs: { index: source },
      options: { sketch: true, center: true, pad: 12 },
    });
    const svg = await renderer.render(compiled.diagram, {
      ...compiled.renderOptions,
      sketch: true,
      center: true,
      pad: 12,
      noXMLTag: true,
    });

    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('Amazon S3');
    expect(svg).toContain('Auto Loader');
    expect(svg).toContain('Delta Lake');
  });

  it('encodes SVGs for the data: image source allowed by the CSP', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Bronze & Silver</text></svg>';
    const dataUrl = svgToDataUrl(svg);

    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1))).toBe(svg);
  });
});
