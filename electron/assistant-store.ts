import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_INSTRUCTIONS_LENGTH, type AssistantProfile, type SaveAssistantProfileInput } from './contracts.js';
import { normalizeModelPolicy } from './validation.js';

const now = () => new Date().toISOString();
const builtIns: AssistantProfile[] = [
  { id: 'general', name: 'Copiloto geral', instructions: 'Ajude com objetividade. Destaque riscos, dúvidas e próximos passos úteis.', modelPolicy: 'default', builtIn: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'facilitator', name: 'Facilitador', instructions: 'Organize a conversa em tópicos, decisões, responsáveis, prazos e pendências. Não invente compromissos.', modelPolicy: 'economy', builtIn: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'interview', name: 'Apoio em entrevista', instructions: 'Ajude a formular respostas autênticas e concisas. Sugira exemplos concretos sem inventar experiências.', modelPolicy: 'quality', builtIn: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

const specialists: AssistantProfile[] = [
  { id: 'screen-analyst', name: 'Analista de tela', instructions: 'Identifique o pedido, problema ou tarefa mais relevante na captura e responda diretamente a ele. Use detalhes visuais como evidência, separe fatos de hipóteses e evite descrever a interface inteira quando isso não ajudar a resolver a tarefa.', modelPolicy: 'balanced', builtIn: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'technical-reviewer', name: 'Revisor tecnico', instructions: 'Revise ideias, codigo e decisoes tecnicas com rigor. Aponte riscos, pressupostos e alternativas praticas. Nao invente requisitos nem trate suposicoes como fatos.', modelPolicy: 'quality', builtIn: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'clear-writer', name: 'Redator claro', instructions: 'Ajude a escrever mensagens, documentos e respostas naturais e objetivas. Preserve a intencao e os fatos fornecidos; ajuste tom e concisao sem acrescentar informacoes.', modelPolicy: 'economy', builtIn: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

const filePath = () => path.join(app.getPath('userData'), 'assistants.json');
const baseProfiles = [...builtIns, ...specialists];

async function readSavedProfiles(): Promise<AssistantProfile[]> {
  try {
    const saved = JSON.parse(await readFile(filePath(), 'utf8')) as unknown;
    return Array.isArray(saved) ? saved as AssistantProfile[] : [];
  } catch { return []; }
}

export async function listProfiles(): Promise<AssistantProfile[]> {
  const saved = await readSavedProfiles();
  const savedById = new Map(saved.map((profile) => [profile.id, profile]));
  const baseIds = new Set(baseProfiles.map((profile) => profile.id));
  const defaults = baseProfiles.map((profile) => {
    const override = savedById.get(profile.id);
    return override?.builtIn ? { ...profile, ...override, builtIn: true } : profile;
  });
  const custom = saved.filter((profile) => !profile.builtIn && !baseIds.has(profile.id));
  return [...defaults, ...custom];
}

export async function getProfile(id?: string): Promise<AssistantProfile> {
  const profiles = await listProfiles();
  return profiles.find((item) => item.id === id) ?? profiles[0];
}

export async function saveProfile(input: SaveAssistantProfileInput): Promise<AssistantProfile> {
  const name = input.name.trim();
  const instructions = input.instructions.trim();
  if (name.length < 2 || name.length > 60) throw new Error('O nome do assistente deve ter entre 2 e 60 caracteres.');
  if (instructions.length < 10 || instructions.length > MAX_INSTRUCTIONS_LENGTH) throw new Error(`As instruções devem ter entre 10 e ${MAX_INSTRUCTIONS_LENGTH.toLocaleString('pt-BR')} caracteres.`);
  const knowledgeFiles = input.knowledgeFiles ?? [];
  if (knowledgeFiles.length > 5) throw new Error('Anexe no máximo 5 documentos por agente.');
  let totalDocumentSize = 0;
  for (const file of knowledgeFiles) {
    const extension = path.extname(file.name).toLowerCase();
    const expectedMimeType = extension === '.pdf' ? 'application/pdf' : extension === '.md' ? 'text/markdown' : undefined;
    if (!expectedMimeType || file.mimeType !== expectedMimeType || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64)) {
      throw new Error('Os documentos do agente devem ser arquivos PDF ou Markdown válidos.');
    }
    const size = Buffer.from(file.dataBase64, 'base64').byteLength;
    if (size !== file.size || size > 10_000_000) throw new Error('Cada documento pode ter até 10 MB.');
    totalDocumentSize += size;
  }
  if (totalDocumentSize > 20_000_000) throw new Error('Os documentos do agente podem somar até 20 MB.');
  const profiles = await listProfiles();
  const existing = input.id ? profiles.find((item) => item.id === input.id) : undefined;
  const timestamp = now();
  const saved: AssistantProfile = {
    id: existing?.id ?? randomUUID(), name, instructions, knowledgeFiles,
    modelPolicy: input.modelPolicy === 'default' ? 'default' : normalizeModelPolicy(input.modelPolicy), builtIn: existing?.builtIn ?? false,
    createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
  };
  const persisted = (await readSavedProfiles()).filter((item) => item.id !== saved.id);
  persisted.push(saved);
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(persisted, null, 2), 'utf8');
  return saved;
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await listProfiles();
  const target = profiles.find((item) => item.id === id);
  if (!target || target.builtIn) throw new Error('Este perfil não pode ser excluído.');
  const persisted = (await readSavedProfiles()).filter((item) => item.id !== id);
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(persisted, null, 2), 'utf8');
}
