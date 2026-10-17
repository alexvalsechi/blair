import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AlibabaReasoningEffort, ModelPolicy, PublicSettings, SaveSettingsInput, ShortcutAction } from './contracts.js';
import { clampOpacity, normalizeAlibabaReasoningEfforts, normalizeModel, normalizeModelPolicy } from './validation.js';

type StoredSettings = {
  encryptedApiKey?: string;
  encryptedAlibabaApiKey?: string;
  encryptedTypeSafeApiKey?: string;
  encryptedAlibabaTranscriptionApiKey?: string;
  model: string;
  analysisProvider: 'openai' | 'alibaba';
  transcriptionModel: string;
  transcriptionProvider: 'openai' | 'alibaba';
  alibabaWorkspaceHost: string;
  captureSourceId: string;
  opacity: number;
  contentProtection: boolean;
  historyEnabled: boolean;
  shortcuts: Record<ShortcutAction, string>;
  layoutPosition: PublicSettings['layoutPosition'];
  scale: number;
  modelPolicy: ModelPolicy;
  policyModels: Record<ModelPolicy, string>;
  alibabaPolicyModels: Record<ModelPolicy, string>;
  alibabaReasoningEfforts: Record<string, AlibabaReasoningEffort>;
};

export const defaultShortcuts: Record<ShortcutAction, string> = {
  ask: 'Control+Enter', capture: 'Control+E', meeting: 'Control+D', 'toggle-overlay': 'Control+B',
  'toggle-dock': 'Control+M', 'toggle-always-on-top': 'Control+Shift+A',
  'opacity-up': 'Control+Shift+=', 'opacity-down': 'Control+Shift+-',
  'toggle-interaction': 'Control+Shift+I',
};

const defaults: StoredSettings = {
  model: 'gpt-5.5',
  analysisProvider: 'openai',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  transcriptionProvider: 'openai',
  alibabaWorkspaceHost: '',
  captureSourceId: '',
  opacity: 0.86,
  contentProtection: true,
  historyEnabled: false,
  shortcuts: defaultShortcuts,
  layoutPosition: 'center',
  scale: 1,
  modelPolicy: 'balanced',
  policyModels: { economy: 'gpt-5.5', balanced: 'gpt-5.5', quality: 'gpt-5.5' },
  alibabaPolicyModels: { economy: 'qwen-turbo', balanced: 'qwen-plus', quality: 'qwen-max' },
  alibabaReasoningEfforts: {},
};

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

async function readStored(): Promise<StoredSettings> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), 'utf8')) as Partial<StoredSettings> & { maxOutputTokens?: unknown; captureDisplayId?: string };
    delete parsed.maxOutputTokens;
    return {
      ...defaults,
      ...parsed,
      encryptedAlibabaApiKey: parsed.encryptedAlibabaApiKey ?? parsed.encryptedAlibabaTranscriptionApiKey,
      shortcuts: { ...defaultShortcuts, ...(parsed.shortcuts ?? {}) },
      opacity: clampOpacity(parsed.opacity ?? defaults.opacity),
      scale: Math.min(1.2, Math.max(0.8, parsed.scale ?? defaults.scale)),
      captureSourceId: normalizeCaptureSourceId(parsed.captureSourceId ?? parsed.captureDisplayId ?? defaults.captureSourceId),
      policyModels: { ...defaults.policyModels, balanced: parsed.model ?? defaults.policyModels.balanced, ...(parsed.policyModels ?? {}) },
      alibabaPolicyModels: { ...defaults.alibabaPolicyModels, ...(parsed.alibabaPolicyModels ?? {}) },
      alibabaReasoningEfforts: normalizeAlibabaReasoningEfforts(parsed.alibabaReasoningEfforts),
      modelPolicy: normalizeModelPolicy(parsed.modelPolicy ?? defaults.modelPolicy),
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
    hasAlibabaApiKey: Boolean(stored.encryptedAlibabaApiKey),
    hasTypeSafeApiKey: Boolean(stored.encryptedTypeSafeApiKey),
    analysisProvider: stored.analysisProvider,
    model: stored.model,
    transcriptionModel: stored.transcriptionModel,
    transcriptionProvider: stored.transcriptionProvider,
    alibabaWorkspaceHost: stored.alibabaWorkspaceHost,
    captureSourceId: stored.captureSourceId,
    opacity: stored.opacity,
    contentProtection: stored.contentProtection,
    historyEnabled: stored.historyEnabled,
    shortcuts: stored.shortcuts,
    layoutPosition: stored.layoutPosition,
    scale: stored.scale,
    modelPolicy: stored.modelPolicy,
    policyModels: stored.policyModels,
    alibabaPolicyModels: stored.alibabaPolicyModels,
    alibabaReasoningEfforts: stored.alibabaReasoningEfforts,
  };
}

export async function saveSettings(input: SaveSettingsInput): Promise<PublicSettings> {
  const stored = await readStored();
  const next: StoredSettings = {
    ...stored,
    model: normalizeModel(input.model),
    analysisProvider: input.analysisProvider ?? stored.analysisProvider,
    transcriptionModel: normalizeModel(input.transcriptionModel ?? stored.transcriptionModel),
    transcriptionProvider: input.transcriptionProvider ?? stored.transcriptionProvider,
    alibabaWorkspaceHost: normalizeAlibabaWorkspaceHost(input.alibabaWorkspaceHost ?? stored.alibabaWorkspaceHost),
    captureSourceId: normalizeCaptureSourceId(input.captureSourceId ?? stored.captureSourceId),
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
    alibabaPolicyModels: {
      economy: normalizeModel(input.alibabaPolicyModels?.economy ?? stored.alibabaPolicyModels.economy),
      balanced: normalizeModel(input.alibabaPolicyModels?.balanced ?? stored.alibabaPolicyModels.balanced),
      quality: normalizeModel(input.alibabaPolicyModels?.quality ?? stored.alibabaPolicyModels.quality),
    },
    alibabaReasoningEfforts: normalizeAlibabaReasoningEfforts(input.alibabaReasoningEfforts ?? stored.alibabaReasoningEfforts),
  };

  if (input.apiKey?.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('A proteção de credenciais do Windows não está disponível. A chave não foi salva.');
    }
    next.encryptedApiKey = safeStorage.encryptString(input.apiKey.trim()).toString('base64');
  }

  if (input.alibabaApiKey?.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('A proteÃ§Ã£o de credenciais do Windows nÃ£o estÃ¡ disponÃ­vel. A chave Alibaba nÃ£o foi salva.');
    }
    next.encryptedAlibabaApiKey = safeStorage.encryptString(input.alibabaApiKey.trim()).toString('base64');
    next.encryptedAlibabaTranscriptionApiKey = undefined;
  }

  if (input.typeSafeApiKey?.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('A proteção de credenciais do Windows não está disponível. A chave TypeSafe não foi salva.');
    }
    next.encryptedTypeSafeApiKey = safeStorage.encryptString(input.typeSafeApiKey.trim()).toString('base64');
  }

  await writeStored(next);
  return getPublicSettings();
}

function normalizeCaptureSourceId(value: string): string {
  const id = value.trim();
  if (!id) return '';
  // Keep accepting the old numeric Display.id value so settings migrate safely.
  if (!/^\d{1,20}$/.test(id) && !/^screen:[^:]+:\d+$/.test(id)) throw new Error('Selecione um monitor válido para captura.');
  return id;
}

function normalizeAlibabaWorkspaceHost(value: string): string {
  const input = value.trim();
  if (!input) return '';
  let host: string;
  try {
    host = new URL(input.includes('://') ? input : `https://${input}`).hostname;
  } catch {
    throw new Error('Informe um API Host válido do Alibaba Model Studio.');
  }
  if (!/^ws-[a-z0-9-]+\.(?:ap-southeast-1|cn-beijing|cn-hongkong|eu-central-1|ap-northeast-1|us-east-1)\.maas\.aliyuncs\.com$/i.test(host)) {
    throw new Error('Informe o API Host de um workspace Alibaba Model Studio válido.');
  }
  return host.toLowerCase();
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

export async function readAlibabaApiKey(): Promise<string> {
  const stored = await readStored();
  if (!stored.encryptedAlibabaApiKey) {
    throw new Error('Configure a chave de transcriÃ§Ã£o da Alibaba Cloud na tela Modelos.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O Windows nÃ£o disponibilizou a proteÃ§Ã£o necessÃ¡ria para ler a chave Alibaba.');
  }
  return safeStorage.decryptString(Buffer.from(stored.encryptedAlibabaApiKey, 'base64'));
}

export async function readTypeSafeApiKey(): Promise<string> {
  const stored = await readStored();
  if (!stored.encryptedTypeSafeApiKey) throw new Error('Configure a chave TypeSafe para ativar os insights rápidos.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('O Windows não disponibilizou a proteção necessária para ler a chave TypeSafe.');
  return safeStorage.decryptString(Buffer.from(stored.encryptedTypeSafeApiKey, 'base64'));
}

