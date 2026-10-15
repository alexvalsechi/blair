import { describe, expect, it } from 'vitest';
import { clampOpacity, filterCurrentAnalysisModels, isResponseModelId, normalizeAlibabaReasoningEfforts, normalizeModel, normalizeModelPolicy, resolveProfilePolicy, supportsAlibabaReasoning } from './validation.js';

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

describe('model catalog filtering', () => {
  it('hides legacy OpenAI model generations while retaining current families', () => {
    expect(filterCurrentAnalysisModels(['gpt-4o', 'gpt-5.6-luna', 'gpt-oss-120b', 'o3', 'o4-mini'], 'openai'))
      .toEqual(['gpt-5.6-luna', 'gpt-oss-120b', 'o4-mini']);
  });

  it('filters older Alibaba generations without excluding current provider families', () => {
    expect(filterCurrentAnalysisModels(['qwen2.5-72b', 'qwen3.8-flash', 'qwen-plus', 'ZHIPU/GLM-4.5', 'ZHIPU/GLM-5.2', 'deepseek-v2.5', 'deepseek-v3.2'], 'alibaba'))
      .toEqual(['deepseek-v3.2', 'qwen3.8-flash', 'ZHIPU/GLM-5.2']);
  });
});

describe('política de modelos', () => {
  it('normaliza políticas desconhecidas para equilíbrio', () => {
    expect(normalizeModelPolicy('economy')).toBe('economy');
    expect(normalizeModelPolicy('unknown')).toBe('balanced');
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

describe('raciocínio Alibaba', () => {
  it('aceita apenas intensidades válidas e IDs de modelo seguros', () => {
    expect(normalizeAlibabaReasoningEfforts({ 'qwen3.8-flash': 'low', 'qwen3.8-max': 'xhigh', 'invalid model': 'none', 'qwen3.8-max-0902': 'surprise' })).toEqual({ 'qwen3.8-flash': 'low', 'qwen3.8-max': 'xhigh' });
  });

  it('só habilita o seletor para famílias Qwen 3 compatíveis', () => {
    expect(supportsAlibabaReasoning('qwen3.8-flash')).toBe(true);
    expect(supportsAlibabaReasoning('qwen3.8-max-0902')).toBe(true);
    expect(supportsAlibabaReasoning('qwen-plus')).toBe(false);
  });
});
