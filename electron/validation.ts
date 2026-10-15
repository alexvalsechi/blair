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

export const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;

export function clampMaxOutputTokens(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(8_000, Math.max(200, Math.round(value)));
}

export function resolveProfilePolicy(profilePolicy: string, defaultPolicy: string): 'economy' | 'balanced' | 'quality' {
  return profilePolicy === 'default' ? normalizeModelPolicy(defaultPolicy) : normalizeModelPolicy(profilePolicy);
}

export function isResponseModelId(id: string): boolean {
  const value = id.toLowerCase();
  const excluded = /(embedding|moderation|whisper|transcrib|tts|realtime|audio|image|dall-e)/;
  return /^(gpt-|o\d|chatgpt-)/.test(value) && !excluded.test(value);
}

export function isTranscriptionModelId(id: string): boolean {
  return /^gpt-[a-z0-9.-]*transcribe$/i.test(id);
}
