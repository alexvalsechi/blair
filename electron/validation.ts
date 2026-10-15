import type { AlibabaReasoningEffort } from './contracts.js';

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.86;
  return Math.min(1, Math.max(0.45, Math.round(value * 100) / 100));
}

export function normalizeModel(value: string): string {
  const model = value.trim();
  if (!/^[a-zA-Z0-9._-]{2,80}$/.test(model)) {
    throw new Error('Informe um identificador de modelo válido.');
  }
  return model;
}

export function normalizeModelPolicy(value: string): 'economy' | 'balanced' | 'quality' {
  return value === 'economy' || value === 'quality' ? value : 'balanced';
}

const alibabaReasoningEfforts = new Set<AlibabaReasoningEffort>(['default', 'none', 'low', 'medium', 'xhigh']);

export function normalizeAlibabaReasoningEfforts(value: Record<string, unknown> | undefined): Record<string, AlibabaReasoningEffort> {
  const result: Record<string, AlibabaReasoningEffort> = {};
  for (const [model, effort] of Object.entries(value ?? {}).slice(0, 200)) {
    if (/^[a-zA-Z0-9._-]{2,80}$/.test(model) && alibabaReasoningEfforts.has(effort as AlibabaReasoningEffort)) {
      result[model] = effort as AlibabaReasoningEffort;
    }
  }
  return result;
}

export function supportsAlibabaReasoning(model: string): boolean {
  return /^qwen3(?:\.\d+)?(?:-|$)/i.test(model);
}

export function resolveProfilePolicy(profilePolicy: string, defaultPolicy: string): 'economy' | 'balanced' | 'quality' {
  return profilePolicy === 'default' ? normalizeModelPolicy(defaultPolicy) : normalizeModelPolicy(profilePolicy);
}

export function isResponseModelId(id: string): boolean {
  const value = id.toLowerCase();
  const excluded = /(embedding|moderation|whisper|transcrib|tts|realtime|audio|image|dall-e)/;
  return /^(gpt-|o\d|chatgpt-)/.test(value) && !excluded.test(value);
}

export function filterCurrentAnalysisModels(models: string[], provider: 'openai' | 'alibaba'): string[] {
  return [...new Set(models)].filter((model) => {
    const id = model.toLowerCase();
    if (provider === 'openai') {
      return /^(?:gpt-(?:[5-9](?:[.-]|$)|oss(?:-|$))|o[4-9](?:[.-]|$)|chatgpt-[5-9](?:[.-]|$))/.test(id);
    }
    if (/^qwen(?:-)?(?:1(?:[.-]|$)|2(?:[.-]|$)|2\.5(?:[.-]|$))/.test(id)) return false;
    if (/^qwen-(?:turbo|plus|max)(?:-|$)/.test(id)) return false;
    const glmGeneration = id.match(/(?:^|\/)glm-(\d+)(?:[.-]|$)/)?.[1];
    if (glmGeneration) return Number(glmGeneration) >= 5;
    const deepseekGeneration = id.match(/(?:^|\/)deepseek-v(\d+)(?:[.-]|$)/)?.[1];
    if (deepseekGeneration) return Number(deepseekGeneration) >= 3;
    return true;
  }).sort((a, b) => a.localeCompare(b));
}

export function isTranscriptionModelId(id: string): boolean {
  return /^gpt-[a-z0-9.-]*transcribe$/i.test(id);
}
