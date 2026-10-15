import { describe, expect, it } from 'vitest';
import { clampMaxOutputTokens, clampOpacity, DEFAULT_MAX_OUTPUT_TOKENS, isResponseModelId, normalizeModel, normalizeModelPolicy, resolveProfilePolicy } from './validation.js';

describe('clampOpacity', () => {
  it('mantém a opacidade dentro do intervalo legível', () => {
    expect(clampOpacity(0.2)).toBe(0.45);
    expect(clampOpacity(0.726)).toBe(0.73);
    expect(clampOpacity(1.4)).toBe(1);
  });

  it('usa um valor seguro para entradas inválidas', () => {
    expect(clampOpacity(Number.NaN)).toBe(0.86);
  });
});

describe('normalizeModel', () => {
  it('aceita identificadores usuais de modelo', () => {
    expect(normalizeModel('  gpt-5.5  ')).toBe('gpt-5.5');
  });

  it('rejeita valores que poderiam alterar a requisição', () => {
    expect(() => normalizeModel('gpt 5.5')).toThrow('identificador de modelo válido');
  });
});

describe('política de modelos', () => {
  it('normaliza políticas desconhecidas para equilíbrio', () => {
    expect(normalizeModelPolicy('economy')).toBe('economy');
    expect(normalizeModelPolicy('unknown')).toBe('balanced');
  });

  it('limita o orçamento de saída', () => {
    expect(clampMaxOutputTokens(50)).toBe(200);
    expect(clampMaxOutputTokens(1_234.6)).toBe(1235);
    expect(clampMaxOutputTokens(20_000)).toBe(8000);
    expect(clampMaxOutputTokens(Number.NaN)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(8000);
  });

  it('herda a política global quando o perfil usa o padrão', () => {
    expect(resolveProfilePolicy('default', 'economy')).toBe('economy');
    expect(resolveProfilePolicy('quality', 'economy')).toBe('quality');
  });

  it('filtra modelos incompatíveis com respostas de texto', () => {
    expect(isResponseModelId('gpt-5.5')).toBe(true);
    expect(isResponseModelId('o3')).toBe(true);
    expect(isResponseModelId('text-embedding-3-small')).toBe(false);
    expect(isResponseModelId('gpt-image-1')).toBe(false);
    expect(isResponseModelId('gpt-realtime')).toBe(false);
  });
});
