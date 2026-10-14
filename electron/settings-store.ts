import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelPolicy, PublicSettings, SaveSettingsInput, ShortcutAction } from './contracts.js';
import { clampMaxOutputTokens, clampOpacity, normalizeModel, normalizeModelPolicy } from './validation.js';

type StoredSettings = {
  encryptedApiKey?: string;
  model: string;
  transcriptionModel: string;
  opacity: number;
  contentProtection: boolean;
  historyEnabled: boolean;
  shortcuts: Record<ShortcutAction, string>;
  layoutPosition: PublicSettings['layoutPosition'];
  scale: number;
  modelPolicy: ModelPolicy;
  policyModels: Record<ModelPolicy, string>;
  maxOutputTokens: number;
};

export const defaultShortcuts: Record<ShortcutAction, string> = {
  ask: 'Control+Enter', capture: 'Control+E', meeting: 'Control+D', 'toggle-overlay': 'Control+B',
  'toggle-dock': 'Control+M', 'toggle-always-on-top': 'Control+Shift+A',
  'opacity-up': 'Control+Shift+=', 'opacity-down': 'Control+Shift+-',
  'toggle-interaction': 'Control+Shift+I',
};

const defaults: StoredSettings = {
  model: 'gpt-5.5',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  opacity: 0.86,
  contentProtection: true,
  historyEnabled: false,
  shortcuts: defaultShortcuts,
  layoutPosition: 'center',
  scale: 1,
  modelPolicy: 'balanced',
  policyModels: { economy: 'gpt-5.5', balanced: 'gpt-5.5', quality: 'gpt-5.5' },
  maxOutputTokens: 1200,
};

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

async function readStored(): Promise<StoredSettings> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), 'utf8')) as Partial<StoredSettings>;
    return {
      ...defaults,
      ...parsed,
      shortcuts: { ...defaultShortcuts, ...(parsed.shortcuts ?? {}) },
      opacity: clampOpacity(parsed.opacity ?? defaults.opacity),
      scale: Math.min(1.2, Math.max(0.8, parsed.scale ?? defaults.scale)),
      policyModels: { ...defaults.policyModels, balanced: parsed.model ?? defaults.policyModels.balanced, ...(parsed.policyModels ?? {}) },
      modelPolicy: normalizeModelPolicy(parsed.modelPolicy ?? defaults.modelPolicy),
      maxOutputTokens: clampMaxOutputTokens(parsed.maxOutputTokens ?? defaults.maxOutputTokens),
    };
  } catch {
    return { ...defaults };
  }
}

async function writeStored(value: StoredSettings): Promise<void> {
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(value, null, 2), 'utf8');
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const stored = await readStored();
  return {
    hasApiKey: Boolean(stored.encryptedApiKey),
    model: stored.model,
    transcriptionModel: stored.transcriptionModel,
    opacity: stored.opacity,
    contentProtection: stored.contentProtection,
    historyEnabled: stored.historyEnabled,
    shortcuts: stored.shortcuts,
    layoutPosition: stored.layoutPosition,
    scale: stored.scale,
    modelPolicy: stored.modelPolicy,
    policyModels: stored.policyModels,
    maxOutputTokens: stored.maxOutputTokens,
  };
}

export async function saveSettings(input: SaveSettingsInput): Promise<PublicSettings> {
  const stored = await readStored();
  const next: StoredSettings = {
    ...stored,
    model: normalizeModel(input.model),
    transcriptionModel: normalizeModel(input.transcriptionModel ?? stored.transcriptionModel),
    contentProtection: Boolean(input.contentProtection),
    historyEnabled: input.historyEnabled ?? stored.historyEnabled,
    shortcuts: { ...stored.shortcuts, ...(input.shortcuts ?? {}) },
    layoutPosition: input.layoutPosition ?? stored.layoutPosition,
    scale: Math.min(1.2, Math.max(0.8, input.scale ?? stored.scale)),
    modelPolicy: normalizeModelPolicy(input.modelPolicy ?? stored.modelPolicy),
    policyModels: {
      economy: normalizeModel(input.policyModels?.economy ?? stored.policyModels.economy),
      balanced: normalizeModel(input.policyModels?.balanced ?? input.model ?? stored.policyModels.balanced),
      quality: normalizeModel(input.policyModels?.quality ?? stored.policyModels.quality),
    },
    maxOutputTokens: clampMaxOutputTokens(input.maxOutputTokens ?? stored.maxOutputTokens),
  };

  if (input.apiKey?.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('A proteção de credenciais do Windows não está disponível. A chave não foi salva.');
    }
    next.encryptedApiKey = safeStorage.encryptString(input.apiKey.trim()).toString('base64');
  }

  await writeStored(next);
  return getPublicSettings();
}

export async function setOpacity(opacity: number): Promise<PublicSettings> {
  const stored = await readStored();
  stored.opacity = clampOpacity(opacity);
  await writeStored(stored);
  return getPublicSettings();
}

export async function readApiKey(): Promise<string> {
  const stored = await readStored();
  if (!stored.encryptedApiKey) {
    throw new Error('Configure sua chave da OpenAI antes de fazer uma pergunta.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O Windows não disponibilizou a proteção necessária para ler a chave.');
  }
  return safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, 'base64'));
}

