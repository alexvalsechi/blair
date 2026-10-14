import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HistoryEntry } from './contracts.js';

const filePath = () => path.join(app.getPath('userData'), 'history.json');
export async function listHistory(): Promise<HistoryEntry[]> {
  try { return JSON.parse(await readFile(filePath(), 'utf8')) as HistoryEntry[]; } catch { return []; }
}
export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const items = await listHistory();
  items.unshift(entry);
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(items.slice(0, 50), null, 2), 'utf8');
}
export async function clearHistory(): Promise<void> { await mkdir(path.dirname(filePath()), { recursive: true }); await writeFile(filePath(), '[]', 'utf8'); }

export async function searchHistory(query: string): Promise<HistoryEntry[]> {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const items = await listHistory();
  if (!normalized) return items;
  return items.filter((item) => `${item.prompt}\n${item.answer}`.toLocaleLowerCase('pt-BR').includes(normalized));
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const items = (await listHistory()).filter((item) => item.id !== id);
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(items, null, 2), 'utf8');
}
