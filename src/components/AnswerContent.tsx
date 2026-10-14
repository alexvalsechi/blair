import { useEffect, useState } from 'react';

type AnswerPart = { type: 'text'; value: string } | { type: 'd2'; value: string };

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

let sharedRenderer: Promise<import('@terrastruct/d2').D2> | null = null;

function getRenderer() {
  sharedRenderer ??= import('@terrastruct/d2').then(({ D2 }) => new D2());
  return sharedRenderer;
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

function D2Diagram({ source }: { source: string }) {
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setImageUrl('');
    setError('');

    void (async () => {
      try {
        if (source.length > 20_000) throw new Error('O bloco D2 excede o limite de 20 mil caracteres.');
        const renderer = await getRenderer();
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
        if (!active) return;
        setImageUrl(svgToDataUrl(svg));
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
      {imageUrl ? (
        <img
          className="d2-diagram-image"
          src={imageUrl}
          alt="Diagrama D2 em modo esboço"
          onError={() => {
            setImageUrl('');
            setError('O navegador não conseguiu carregar o SVG gerado.');
          }}
        />
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
        part.value.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => (
          <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>
        ))
      ))}
    </>
  );
}
