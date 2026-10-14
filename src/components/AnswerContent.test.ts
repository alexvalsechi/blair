import { describe, expect, it } from 'vitest';
import { D2 } from '@terrastruct/d2';
import { normalizeRenderedSvg, serializeRendererOperation } from './AnswerContent';

describe('D2 answer rendering', () => {
  it('serializes concurrent operations that share the D2 worker', async () => {
    const events: string[] = [];
    const operation = (name: string) => serializeRendererOperation(async () => {
      events.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push(`${name}:end`);
      return name;
    });

    const results = await Promise.all([operation('first'), operation('second')]);
    expect(results).toEqual(['first', 'second']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('normalizes string, binary and worker-object SVG outputs', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(await normalizeRenderedSvg(svg)).toBe(svg);
    expect(await normalizeRenderedSvg(new TextEncoder().encode(svg))).toBe(svg);
    expect(await normalizeRenderedSvg({ data: new TextEncoder().encode(svg) })).toBe(svg);
  });

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

  it('renders grouped AWS and Databricks nodes with the render-command comment', async () => {
    const renderer = new D2();
    const source = [
      '# render-command: d2 --sketch input.d2 output.svg',
      'style: {',
      '  font-size: 24',
      '}',
      'AWS: {',
      '  label: "AWS"',
      '  S3_ORIGEM: "S3\\nOrigem"',
      '  S3_LAKE: "S3\\nDelta Lake"',
      '}',
      'DATABRICKS: {',
      '  label: "Databricks"',
      '  INGESTAO: "Auto Loader\\nJobs"',
      '  BRONZE: "Bronze\\nRaw"',
      '  SILVER: "Silver\\nTratada"',
      '  GOLD: "Gold\\nAnalytics"',
      '  UC: "Unity Catalog"',
      '  SQL: "SQL Warehouse"',
      '}',
      'S3_ORIGEM -> INGESTAO -> BRONZE -> SILVER -> GOLD -> SQL',
      'S3_LAKE -> BRONZE',
      'UC -> BRONZE',
      'UC -> SILVER',
      'UC -> GOLD',
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
    expect(svg).toContain('Auto Loader');
    expect(svg).toContain('Unity Catalog');
    expect(svg).toContain('SQL Warehouse');
  });

  it('renders a data lake architecture with a direction declaration', async () => {
    const renderer = new D2();
    const source = [
      '# render-command: d2 --sketch input.d2 output.svg',
      'direction: right',
      'style: { font-size: 24 }',
      'origem: {',
      '  label: "Origem"',
      '  style.fill: "#E8F1FF"',
      '  sistemas: "ERP / APIs / Logs"',
      '}',
      's3: { label: "Amazon S3" }',
      'databricks: {',
      '  label: "Databricks"',
      '  bronze: "Bronze"',
      '  silver: "Silver"',
      '  gold: "Gold"',
      '}',
      'bi: "BI / ML"',
      'origem -> s3 -> databricks.bronze -> databricks.silver -> databricks.gold -> bi',
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
    expect(svg).toContain('ERP / APIs / Logs');
    expect(svg).toContain('Amazon S3');
    expect(svg).toContain('Bronze');
  });
});
