import { useCallback, useEffect, useRef, useState } from 'react';
import type { InsightDebugInfo, InsightInput, InsightTranscriptUpdate } from '../../electron/contracts';
import { errorMessage } from './errors';

type InsightState = { status: 'waiting' | 'loading' | 'success' | 'error' | 'missing-key'; text: string; message?: string; draft?: boolean };
type InsightConfig = { profileId: string; hasTypeSafeApiKey: boolean; hasAnalysisApiKey: boolean; debugEnabled: boolean };
export type InsightDiagnostic = { id: number; at: string; title: string; detail: string; debug?: InsightDebugInfo };
const MIN_INTERVAL_MS = 1_500;
const MAX_SUGGESTIONS = 30;
const MAX_DIAGNOSTICS = 40;

export function useLiveInsights(config: InsightConfig) {
  const configRef = useRef(config);
  configRef.current = config;
  const [insight, setInsight] = useState<InsightState>({ status: 'waiting', text: '' });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [diagnostics, setDiagnostics] = useState<InsightDiagnostic[]>([]);
  const diagnosticIdRef = useRef(0);
  const suggestionRef = useRef('');
  const historyRef = useRef<string[]>([]);
  const answeredRef = useRef<Array<{ segmentId: string; question: string; answer: string }>>([]);
  const answeredSegmentIdsRef = useRef(new Set<string>());
  const loggedSuppressedSegmentsRef = useRef(new Set<string>());
  const indexRef = useRef(-1);
  const pendingRef = useRef<InsightTranscriptUpdate | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const epochRef = useRef(0);
  const activeRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const lastFingerprintRef = useRef('');

  const logDiagnostic = useCallback((title: string, detail: string, debug?: InsightDebugInfo) => {
    if (!configRef.current.debugEnabled) return;
    const entry: InsightDiagnostic = { id: ++diagnosticIdRef.current, at: new Date().toLocaleTimeString('pt-BR'), title, detail, debug };
    setDiagnostics((items) => [...items, entry].slice(-MAX_DIAGNOSTICS));
  }, []);
  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const discardPendingForSegment = (segmentId: string) => {
    if (pendingRef.current?.segmentId !== segmentId) return;
    pendingRef.current = null;
    clearTimer();
  };

  const run = useCallback(async () => {
    if (runningRef.current || !activeRef.current || !pendingRef.current) return;
    const update = pendingRef.current;
    pendingRef.current = null;
    if (answeredSegmentIdsRef.current.has(update.segmentId)) return;
    const fingerprint = `${update.segmentId}:${update.isFinal}:${update.liveText}`;
    if (fingerprint === lastFingerprintRef.current) {
      logDiagnostic('Duplicado ignorado', `Mesmo trecho ${update.segmentId} recebido novamente (${update.isFinal ? 'final' : 'parcial'}).`);
      return;
    }
    lastFingerprintRef.current = fingerprint;
    const currentConfig = configRef.current;
    if (!currentConfig.hasTypeSafeApiKey) {
      logDiagnostic('Configuração ausente', 'A chave TypeSafe não está configurada.');
      setInsight((current) => ({ ...current, status: 'missing-key', message: 'Configure a chave TypeSafe em Conexão para receber sugestões.' }));
      return;
    }
    if (!currentConfig.hasAnalysisApiKey) {
      logDiagnostic('Configuração ausente', 'A chave do provedor de análise não está configurada.');
      setInsight((current) => ({ ...current, status: 'error', message: 'Configure a chave do provedor de análise para gerar sugestões.' }));
      return;
    }
    runningRef.current = true;
    lastAttemptRef.current = Date.now();
    const epoch = epochRef.current;
    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    setInsight((current) => ({ status: suggestionRef.current ? 'success' : 'waiting', text: suggestionRef.current, message: undefined }));
    const input: InsightInput = { ...update, requestId, profileId: currentConfig.profileId, visibleSuggestion: suggestionRef.current, answered: answeredRef.current.slice(-4).map(({ question, answer }) => ({ question, answer })) };
    logDiagnostic('Requisição enviada', `${update.isFinal ? 'Fala finalizada' : 'Fala parcial'} • ${update.finalized.length} falas no contexto • ${update.liveText.length} caracteres • segmento ${update.segmentId}.`, undefined);
    try {
      const result = await window.persona.evaluateInsight(input);
      if (epoch !== epochRef.current || !activeRef.current) return;
      logDiagnostic(result.status === 'suggestion' ? 'Sugestão gerada' : result.status === 'error' ? 'Falha na avaliação' : 'Geração não aprovada', result.status === 'suggestion' ? `${result.text.length} caracteres retornados.` : result.status === 'error' ? result.message : 'A classificação ou uma etapa posterior descartou a sugestão.', result.debug);
      if (result.status === 'suggestion') {
        answeredRef.current = [...answeredRef.current, { segmentId: update.segmentId, question: update.liveText, answer: result.text }].slice(-MAX_SUGGESTIONS);
        answeredSegmentIdsRef.current = new Set(answeredRef.current.map((item) => item.segmentId));
        discardPendingForSegment(update.segmentId);
        suggestionRef.current = result.text;
        const nextHistory = [...historyRef.current, result.text].slice(-MAX_SUGGESTIONS);
        historyRef.current = nextHistory;
        indexRef.current = nextHistory.length - 1;
        setSuggestions(nextHistory);
        setSuggestionIndex(indexRef.current);
        setInsight({ status: 'success', text: result.text });
      } else if (result.status === 'error') {
        setInsight({ status: 'error', text: suggestionRef.current, message: result.message });
      } else {
        setInsight({ status: suggestionRef.current ? 'success' : 'waiting', text: suggestionRef.current });
      }
    } catch (reason) {
      if (epoch !== epochRef.current || !activeRef.current) return;
      const message = errorMessage(reason);
      logDiagnostic('Falha de comunicação', message);
      if (!/abort|cancelad/i.test(message)) setInsight({ status: 'error', text: suggestionRef.current, message });
    } finally {
      if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = null;
      runningRef.current = false;
      if (pendingRef.current && activeRef.current) {
        clearTimer();
        timerRef.current = window.setTimeout(() => void run(), Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastAttemptRef.current)));
      }
    }
  }, [logDiagnostic]);

  useEffect(() => {
    if (typeof window.persona.onInsightProgress !== 'function') return;
    return window.persona.onInsightProgress((progress) => {
      if (!activeRef.current || progress.requestId !== activeRequestIdRef.current) return;
      if (progress.stage === 'generation') {
        logDiagnostic('Geração iniciada', 'O Jev aprovou a fala; o modelo está preparando a resposta.');
        setInsight((current) => ({ ...current, status: 'loading', message: undefined }));
      } else if (!suggestionRef.current) {
        setInsight({ status: 'loading', text: progress.text, draft: true });
      }
    });
  }, [logDiagnostic]);

  const navigateSuggestions = useCallback((delta: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min(historyRef.current.length - 1, indexRef.current + delta));
    if (nextIndex === indexRef.current || !historyRef.current[nextIndex]) return;
    indexRef.current = nextIndex;
    const text = historyRef.current[nextIndex];
    suggestionRef.current = text;
    setSuggestionIndex(nextIndex);
    setInsight((current) => ({ ...current, status: 'success', text, message: undefined }));
  }, []);

  const onTranscript = useCallback((update: InsightTranscriptUpdate) => {
    if (!activeRef.current || !update.liveText.trim()) return;
    if (answeredSegmentIdsRef.current.has(update.segmentId)) {
      if (!loggedSuppressedSegmentsRef.current.has(update.segmentId)) {
        loggedSuppressedSegmentsRef.current.add(update.segmentId);
        logDiagnostic('Pergunta já respondida', `O segmento ${update.segmentId} já gerou uma sugestão; as revisões da transcrição foram ignoradas.`);
      }
      return;
    }
    logDiagnostic(update.isFinal ? 'Transcrição finalizada' : 'Transcrição parcial', `${update.liveText.length} caracteres • ${update.finalized.length} falas finalizadas • segmento ${update.segmentId}: “${update.liveText.slice(0, 180)}${update.liveText.length > 180 ? '…' : ''}”`);
    pendingRef.current = update;
    clearTimer();
    const debounce = update.isFinal ? 0 : 500;
    const waitMs = Math.max(debounce, MIN_INTERVAL_MS - (Date.now() - lastAttemptRef.current));
    logDiagnostic('Avaliação agendada', `Início em ${waitMs} ms (${update.isFinal ? 'finalizada' : 'estabilização parcial'} e intervalo mínimo).`);
    timerRef.current = window.setTimeout(() => void run(), waitMs);
  }, [logDiagnostic, run]);

  const onSessionActiveChange = useCallback((active: boolean) => {
    epochRef.current += 1;
    activeRef.current = active;
    clearTimer();
    pendingRef.current = null;
    activeRequestIdRef.current = null;
    lastAttemptRef.current = 0;
    lastFingerprintRef.current = '';
    suggestionRef.current = '';
    historyRef.current = [];
    answeredRef.current = [];
    answeredSegmentIdsRef.current.clear();
    loggedSuppressedSegmentsRef.current.clear();
    indexRef.current = -1;
    setSuggestions([]);
    setSuggestionIndex(-1);
    setDiagnostics([]);
    window.persona.cancelInsight();
    setInsight(active && !configRef.current.hasTypeSafeApiKey
      ? { status: 'missing-key', text: '', message: 'Configure a chave TypeSafe em Conexão para receber sugestões.' }
      : { status: 'waiting', text: '' });
  }, []);

  useEffect(() => () => {
    epochRef.current += 1;
    activeRef.current = false;
    activeRequestIdRef.current = null;
    clearTimer();
    window.persona.cancelInsight();
  }, []);

  useEffect(() => {
    if (activeRef.current) onSessionActiveChange(true);
  }, [config.profileId, onSessionActiveChange]);

  useEffect(() => {
    if (activeRef.current && config.hasTypeSafeApiKey) {
      setInsight((current) => current.status === 'missing-key' ? { status: 'waiting', text: current.text } : current);
    }
  }, [config.hasTypeSafeApiKey]);

  return { insight, suggestions, suggestionIndex, navigateSuggestions, onTranscript, onSessionActiveChange, diagnostics, clearDiagnostics };
}
