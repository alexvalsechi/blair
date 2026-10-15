import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type AnswerPart = { type: 'text'; value: string } | { type: 'd2'; value: string };

export async function normalizeRenderedSvg(output: unknown): Promise<string> {
  if (typeof output === 'string') return output;
  if (typeof Blob !== 'undefined' && output instanceof Blob) return output.text();
  if (output instanceof ArrayBuffer) return new TextDecoder().decode(output);
  if (ArrayBuffer.isView(output)) {
    return new TextDecoder().decode(new Uint8Array(output.buffer, output.byteOffset, output.byteLength));
  }
  if (Array.isArray(output) && output.every((part) => typeof part === 'string')) return output.join('');

  if (output && typeof output === 'object') {
    const value = output as Record<string, unknown>;
    for (const key of ['svg', 'data', 'content', 'output', 'result']) {
      if (key in value) {
        try {
          return await normalizeRenderedSvg(value[key]);
        } catch {
          // Continue checking the other common worker response fields.
        }
      }
    }
    const keys = Object.keys(value).slice(0, 8).join(', ') || '(sem propriedades)';
    throw new Error(`Formato inesperado do renderer: ${Object.prototype.toString.call(output)}; propriedades: ${keys}.`);
  }

  throw new Error(`Formato inesperado do renderer: ${String(output)}.`);
}

export function sanitizeRenderedSvg(svg: string): string {
  const output = svg.trim();
  const svgStart = output.search(/<svg\b/i);
  const svgEnd = output.toLowerCase().lastIndexOf('</svg>');
  const markup = svgStart >= 0 && svgEnd >= svgStart
    ? output.slice(svgStart, svgEnd + '</svg>'.length)
    : output;
  const parser = new DOMParser();
  let document = parser.parseFromString(markup, 'image/svg+xml');
  let root: Element | null = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror')) {
    document = parser.parseFromString(markup, 'text/html');
    root = document.querySelector('svg');
  }
  if (!root || root.localName !== 'svg') {
    const preview = output.slice(0, 140).replace(/\s+/g, ' ');
    throw new Error(`A saída do renderer não contém SVG (tipo string, ${svg.length} caracteres): ${preview || '(vazia)'}`);
  }

  const forbiddenTags = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed']);
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (forbiddenTags.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || /javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      } else if ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#') && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)) {
        element.removeAttribute(attribute.name);
      } else if (/(?:@import|url\(\s*['"]?(?!#|data:image\/))/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const style of Array.from(root.querySelectorAll('style'))) {
    if (/@import|url\(\s*['"]?(?!#|data:image\/)/i.test(style.textContent ?? '')) style.remove();
  }

  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Diagrama D2 em modo esboço');
  root.setAttribute('style', 'display:block;width:100%;height:auto;max-height:min(62vh, 620px);');
  return new XMLSerializer().serializeToString(root);
}

let sharedRenderer: Promise<import('@terrastruct/d2').D2> | null = null;
let rendererQueue: Promise<void> = Promise.resolve();

function getRenderer() {
  sharedRenderer ??= import('@terrastruct/d2').then(({ D2 }) => new D2());
  return sharedRenderer;
}

export function serializeRendererOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = rendererQueue.then(operation);
  rendererQueue = result.then(() => undefined, () => undefined);
  return result;
}

function withRenderer<T>(operation: (renderer: import('@terrastruct/d2').D2) => Promise<T>): Promise<T> {
  return serializeRendererOperation(async () => operation(await getRenderer()));
}

function splitAnswer(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const d2Fence = /(`{3,})d2[^\S\r\n]*\r?\n([\s\S]*?)\1/gi;
  let cursor = 0;

  for (const match of text.matchAll(d2Fence)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: 'text', value: text.slice(cursor, index) });
    parts.push({ type: 'd2', value: match[2].trim() });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts;
}

function normalizeD2Source(source: string): string {
  return source.replace(/^(\s*style\.(?:stroke|fill):\s*)(#[\da-f]{3,8})(\s*(?:#.*)?)$/gim, '$1"$2"$3');
}

function D2Diagram({ source }: { source: string }) {
  const [svgMarkup, setSvgMarkup] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setSvgMarkup('');
    setError('');

    void (async () => {
      try {
        if (source.length > 20_000) throw new Error('O bloco D2 excede o limite de 20 mil caracteres.');
        const renderSource = normalizeD2Source(source);
        const rendered = await withRenderer(async (renderer) => {
          const compiled = await renderer.compile({
            fs: { index: renderSource },
            options: { sketch: true, center: true, pad: 12 },
          });
          if (!active) return null;
          return renderer.render(compiled.diagram, {
            ...compiled.renderOptions,
            sketch: true,
            center: true,
            pad: 12,
            noXMLTag: true,
          });
        });
        if (!active || rendered === null) return;
        const svg = await normalizeRenderedSvg(rendered);
        setSvgMarkup(sanitizeRenderedSvg(svg));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Erro desconhecido ao renderizar o diagrama.');
      }
    })();

    return () => {
      active = false;
    };
  }, [source]);

  return (
    <div className="d2-diagram-card">
      {svgMarkup ? (
        <div className="d2-diagram-image" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
      ) : error ? (
        <div className="d2-diagram-error" role="status">
          <p>Não foi possível renderizar o diagrama D2: {error}</p>
          <details><summary>Ver código D2</summary><pre>{source}</pre></details>
        </div>
      ) : (
        <p className="d2-diagram-loading" role="status">Renderizando diagrama…</p>
      )}
    </div>
  );
}

export function AnswerContent({ text }: { text: string }) {
  return (
    <>
      {splitAnswer(text).map((part, index) => part.type === 'd2' ? (
        <D2Diagram key={`${index}-${part.value}`} source={part.value} />
      ) : (
        <div className="answer-markdown" key={`${index}-${part.value}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.value}</ReactMarkdown>
        </div>
      ))}
    </>
  );
}
