import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { Attachment } from './contracts.js';

const CHUNK_CHARS = 2_800;
const CHUNK_OVERLAP = 320;
const MAX_RETRIEVED_CHARS = 8_000;
const MAX_RETRIEVED_CHUNKS = 6;

type KnowledgeChunk = {
  text: string;
  page?: number;
  embedding?: number[];
};

type KnowledgeIndex = {
  version: 1;
  hash: string;
  embeddingModel: string;
  embeddingAvailable?: boolean;
  chunks: KnowledgeChunk[];
};

export type RetrievedKnowledge = {
  context: string;
  embeddingInputTokens: number;
};

function embeddingModelForHost(workspaceHost: string): string {
  if (/\.ap-southeast-1\./i.test(workspaceHost)) return 'qwen3.7-text-embedding';
  if (/\.(?:cn-beijing|cn-hongkong)\./i.test(workspaceHost)) return 'text-embedding-v4';
  return 'lexical';
}

function splitText(text: string, page?: number): KnowledgeChunk[] {
  const normalized = text.replace(/\r/g, '').replace(/[\t\u00a0]+/g, ' ').trim();
  if (!normalized) return [];
  const chunks: KnowledgeChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_CHARS, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf('\n', end), normalized.lastIndexOf(' ', end));
      if (boundary > start + Math.floor(CHUNK_CHARS * 0.6)) end = boundary;
    }
    const value = normalized.slice(start, end).trim();
    if (value.length > 40) chunks.push({ text: value, page });
    start = end >= normalized.length ? normalized.length : Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

async function extractPdf(data: Buffer, signal?: AbortSignal): Promise<KnowledgeChunk[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 });
  const chunks: KnowledgeChunk[] = [];
  try {
    const document = await loadingTask.promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (signal?.aborted) throw new DOMException('A análise foi cancelada.', 'AbortError');
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
      chunks.push(...splitText(text, pageNumber));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  if (!chunks.length) throw new Error('O PDF não contém texto selecionável para indexação.');
  return chunks;
}

function cachePath(hash: string): string {
  return path.join(app.getPath('userData'), 'knowledge-index', `${hash}.json`);
}

async function readCache(file: string, hash: string): Promise<KnowledgeIndex | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as KnowledgeIndex;
    if (parsed.version === 1 && parsed.hash === hash && Array.isArray(parsed.chunks)) return parsed;
  } catch {
    // A missing or damaged index is rebuilt from the original attached document.
  }
  return null;
}

async function createEmbeddings(client: OpenAI, model: string, chunks: KnowledgeChunk[], signal?: AbortSignal): Promise<number> {
  let inputTokens = 0;
  const batchSize = model === 'text-embedding-v4' ? 8 : 20;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const response = await client.embeddings.create({ model, input: batch.map((chunk) => chunk.text) }, signal ? { signal } : undefined);
    for (const result of response.data) {
      if (result.index < batch.length) batch[result.index].embedding = result.embedding;
    }
    const usage = response.usage as unknown as { prompt_tokens?: number; total_tokens?: number } | undefined;
    inputTokens += usage?.prompt_tokens ?? usage?.total_tokens ?? 0;
  }
  return inputTokens;
}

async function loadIndex(
  file: Attachment,
  client: OpenAI,
  model: string,
  signal?: AbortSignal,
): Promise<{ index: KnowledgeIndex; embeddingInputTokens: number }> {
  const bytes = Buffer.from(file.dataBase64, 'base64');
  const hash = createHash('sha256').update(file.mimeType).update(bytes).digest('hex');
  const location = cachePath(hash);
  const cached = await readCache(location, hash);
  if (cached?.embeddingModel === model && (cached.embeddingAvailable === false || cached.chunks.every((chunk) => Array.isArray(chunk.embedding)))) {
    return { index: cached, embeddingInputTokens: 0 };
  }

  let chunks: KnowledgeChunk[];
  if (file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    chunks = await extractPdf(bytes, signal);
  } else {
    chunks = splitText(bytes.toString('utf8'));
    if (!chunks.length) throw new Error(`Não foi possível extrair texto de ${file.name}.`);
  }

  let embeddingInputTokens = 0;
  let embeddingAvailable = model !== 'lexical';
  if (embeddingAvailable) {
    try {
      embeddingInputTokens = await createEmbeddings(client, model, chunks, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      embeddingAvailable = false;
      // Keep the extracted text indexed and use lexical matching if embeddings are unavailable.
    }
  }
  const index: KnowledgeIndex = { version: 1, hash, embeddingModel: model, embeddingAvailable, chunks };
  await mkdir(path.dirname(location), { recursive: true });
  await writeFile(location, JSON.stringify(index), 'utf8');
  return { index, embeddingInputTokens };
}

function vectorSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

function queryTerms(query: string): string[] {
  const stopWords = new Set(['para', 'com', 'uma', 'que', 'por', 'dos', 'das', 'the', 'and', 'for', 'with', 'this', 'that']);
  return [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((word) => !stopWords.has(word));
}

function lexicalScore(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const value = text.toLocaleLowerCase();
  const matched = terms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0);
  return Math.min(1, matched / Math.min(8, terms.length));
}

export async function retrieveKnowledge(
  files: Attachment[],
  query: string,
  apiKey: string,
  workspaceHost: string,
  signal?: AbortSignal,
): Promise<RetrievedKnowledge> {
  const supportedFiles = files.filter((file) => file.mimeType === 'application/pdf'
    || file.mimeType === 'text/markdown'
    || file.mimeType === 'text/plain'
    || file.mimeType === 'text/csv'
    || file.mimeType === 'application/json'
    || /\.(?:md|txt|csv|json)$/i.test(file.name));
  if (!supportedFiles.length) return { context: '', embeddingInputTokens: 0 };

  const model = embeddingModelForHost(workspaceHost);
  const client = new OpenAI({ apiKey, baseURL: `https://${workspaceHost}/compatible-mode/v1` });
  const indexes: KnowledgeIndex[] = [];
  let embeddingInputTokens = 0;
  for (const file of supportedFiles) {
    if (signal?.aborted) throw new DOMException('A análise foi cancelada.', 'AbortError');
    const loaded = await loadIndex(file, client, model, signal);
    indexes.push(loaded.index);
    embeddingInputTokens += loaded.embeddingInputTokens;
  }

  let queryVector: number[] | undefined;
  try {
    if (indexes.every((index) => index.embeddingAvailable === false)) throw new Error('Embeddings não disponíveis nesta região.');
    const embedded = await client.embeddings.create({ model, input: query }, signal ? { signal } : undefined);
    queryVector = embedded.data[0]?.embedding;
    const usage = embedded.usage as unknown as { prompt_tokens?: number; total_tokens?: number } | undefined;
    embeddingInputTokens += usage?.prompt_tokens ?? usage?.total_tokens ?? 0;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Lexical retrieval remains available when the region/model has no embedding access.
  }

  const terms = queryTerms(query);
  const candidates = indexes.flatMap((index, fileIndex) => index.chunks.map((chunk) => {
    const semantic = queryVector && chunk.embedding ? Math.max(0, vectorSimilarity(queryVector, chunk.embedding)) : 0;
    const lexical = lexicalScore(chunk.text, terms);
    const score = queryVector && chunk.embedding ? semantic * 0.75 + lexical * 0.25 : lexical;
    return { ...chunk, fileName: supportedFiles[fileIndex].name, score };
  })).filter((chunk) => chunk.score > 0.08).sort((left, right) => right.score - left.score);

  const selected: typeof candidates = [];
  let totalChars = 0;
  for (const candidate of candidates) {
    if (selected.length >= MAX_RETRIEVED_CHUNKS) break;
    if (totalChars + candidate.text.length > MAX_RETRIEVED_CHARS && selected.length) continue;
    selected.push(candidate);
    totalChars += candidate.text.length;
  }
  const context = selected.map((chunk) => {
    const location = chunk.page ? `, página ${chunk.page}` : '';
    return `[${chunk.fileName}${location}]\n${chunk.text}`;
  }).join('\n\n');
  return { context, embeddingInputTokens };
}
