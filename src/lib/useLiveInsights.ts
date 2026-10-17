import { useCallback, useEffect, useRef, useState } from 'react';
import type { InsightInput, InsightTranscriptUpdate } from '../../electron/contracts';
import { errorMessage } from './errors';

type InsightState = { status: 'waiting' | 'loading' | 'success' | 'error' | 'missing-key'; text: string; message?: string };
type InsightConfig = { profileId: string; hasTypeSafeApiKey: boolean; hasAnalysisApiKey: boolean };
const MIN_INTERVAL_MS = 3_500;
const MAX_SUGGESTIONS = 30;

export function useLiveInsights(config: InsightConfig) {
  const configRef = useRef(config);
  configRef.current = config;
  const [insight, setInsight] = useState<InsightState>({ status: 'waiting', text: '' });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const suggestionRef = useRef('');
  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const pendingRef = useRef<InsightTranscriptUpdate | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const epochRef = useRef(0);
  const activeRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const lastFingerprintRef = useRef('');

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const run = useCallback(async () => {
    if (runningRef.current || !activeRef.current || !pendingRef.current) return;
    const update = pendingRef.current;
    pendingRef.current = null;
    const fingerprint = `${update.segmentId}:${update.isFinal}:${update.liveText}`;
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;
    const currentConfig = configRef.current;
    if (!currentConfig.hasTypeSafeApiKey) {
      setInsight((current) => ({ ...current, status: 'missing-key', message: 'Configure a chave TypeSafe em Conexão para receber sugestões.' }));
      return;
    }
    if (!currentConfig.hasAnalysisApiKey) {
      setInsight((current) => ({ ...current, status: 'error', message: 'Configure a chave do provedor de análise para gerar sugestões.' }));
      return;
    }
    runningRef.current = true;
    lastAttemptRef.current = Date.now();
    const epoch = epochRef.current;
    setInsight((current) => ({ ...current, status: 'loading', message: undefined }));
    const input: InsightInput = { ...update, profileId: currentConfig.profileId, visibleSuggestion: suggestionRef.current };
    try {
      const result = await window.persona.evaluateInsight(input);
      if (epoch !== epochRef.current || !activeRef.current) return;
      if (result.status === 'suggestion') {
        suggestionRef.current = result.text;
        const nextHistory = [...historyRef.current, result.text].slice(-MAX_SUGGESTIONS);
        historyRef.current = nextHistory;
        indexRef.current = nextHistory.length - 1;
        setSuggestions(nextHistory);
        setSuggestionIndex(indexRef.current);
        setInsight({ status: 'success', text: result.text });
      } else {
        setInsight((current) => ({ ...current, status: current.text ? 'success' : 'waiting', message: undefined }));
      }
    } catch (reason) {
      if (epoch !== epochRef.current || !activeRef.current) return;
      const message = errorMessage(reason);
      if (!/abort|cancelad/i.test(message)) setInsight((current) => ({ ...current, status: 'error', message }));
    } finally {
      runningRef.current = false;
      if (pendingRef.current && activeRef.current) {
        clearTimer();
        timerRef.current = window.setTimeout(() => void run(), Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastAttemptRef.current)));
      }
    }
  }, []);

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
    pendingRef.current = update;
    clearTimer();
    const debounce = update.isFinal ? 0 : 700;
    timerRef.current = window.setTimeout(() => void run(), Math.max(debounce, MIN_INTERVAL_MS - (Date.now() - lastAttemptRef.current)));
  }, [run]);

  const onSessionActiveChange = useCallback((active: boolean) => {
    epochRef.current += 1;
    activeRef.current = active;
    clearTimer();
    pendingRef.current = null;
    lastAttemptRef.current = 0;
    lastFingerprintRef.current = '';
    suggestionRef.current = '';
    historyRef.current = [];
    indexRef.current = -1;
    setSuggestions([]);
    setSuggestionIndex(-1);
    window.persona.cancelInsight();
    setInsight(active && !configRef.current.hasTypeSafeApiKey
      ? { status: 'missing-key', text: '', message: 'Configure a chave TypeSafe em Conexão para receber sugestões.' }
      : { status: 'waiting', text: '' });
  }, []);

  useEffect(() => () => {
    epochRef.current += 1;
    activeRef.current = false;
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

  return { insight, suggestions, suggestionIndex, navigateSuggestions, onTranscript, onSessionActiveChange };
}
