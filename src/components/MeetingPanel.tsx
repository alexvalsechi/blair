import { AudioLines, CircleStop, Mic, MicOff, RefreshCw, Sparkles, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlibabaTranscriptionEvent, AudioSource, TranscriptSegment } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { alibabaTranscriptionCost } from '../lib/model-pricing';
import { getUnanalyzedSegments } from '../lib/transcript-cursor';

type Props = {
  hasApiKey: boolean;
  hasAlibabaApiKey: boolean;
  hasAlibabaWorkspaceHost: boolean;
  alibabaWorkspaceHost: string;
  transcriptionProvider: 'openai' | 'alibaba';
  isAnswerBusy: boolean;
  activeProfileId: string;
  analysisRequestId: number;
  onSummary(text: string): void;
  onSessionActiveChange(active: boolean): void;
  onAnalysisStateChange(analyzing: boolean): void;
};

type MeetingState = 'setup' | 'starting' | 'recording' | 'ending' | 'finished';

const SEGMENT_MS = 12_000;
type AudioChannel = 'microphone' | 'computer';
type ChannelValues<T> = Record<AudioChannel, T>;

function measureAudioLevel(analyser: AnalyserNode): number {
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
  const decibels = 20 * Math.log10(Math.max(rms, 0.0001));
  return Math.max(0, Math.min(1, (decibels + 60) / 54));
}

function AudioChannelMeter({ channel, level, muted, onToggleMute }: {
  channel: AudioChannel;
  level: number;
  muted: boolean;
  onToggleMute(): void;
}) {
  const label = channel === 'microphone' ? 'Microfone' : 'Saída do sistema';
  const activeLabel = channel === 'microphone' ? 'Voz detectada' : 'Áudio detectado';
  const Icon = channel === 'microphone' ? Mic : Volume2;
  const MutedIcon = channel === 'microphone' ? MicOff : VolumeX;
  const ActionIcon = muted ? Icon : MutedIcon;
  const status = muted ? 'Silenciado na transcrição' : level > 0.08 ? activeLabel : 'Aguardando som';

  return (
    <div className={`audio-channel ${muted ? 'is-muted' : ''}`}>
      <div className="audio-channel-heading"><span><Icon size={14} />{label}</span><strong>{status}</strong></div>
      <div className="audio-channel-controls">
        <div className="audio-level-track" role="meter" aria-label={`Nível de ${label.toLocaleLowerCase()}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} aria-valuetext={`${Math.round(level * 100)}%${muted ? ', silenciado na transcrição' : ''}`}>
          <span style={{ transform: `scaleX(${level})` }} />
        </div>
        <button type="button" className="audio-channel-mute" aria-pressed={muted} aria-label={`${muted ? 'Ativar' : 'Silenciar'} ${label.toLocaleLowerCase()}`} onClick={onToggleMute}>
          <ActionIcon size={14} />{muted ? 'Silenciado' : 'Silenciar'}
        </button>
      </div>
    </div>
  );
}

export function MeetingPanel({ hasApiKey, hasAlibabaApiKey, hasAlibabaWorkspaceHost, alibabaWorkspaceHost, transcriptionProvider, isAnswerBusy, activeProfileId, analysisRequestId, onSummary, onSessionActiveChange, onAnalysisStateChange }: Props) {
  const [state, setState] = useState<MeetingState>('setup');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioLevels, setAudioLevels] = useState<ChannelValues<number>>({ microphone: 0, computer: 0 });
  const [mutedChannels, setMutedChannels] = useState<ChannelValues<boolean>>({ microphone: false, computer: false });
  const [alibabaUsage, setAlibabaUsage] = useState({ inputTokens: 0, outputTokens: 0 });
  const [alibabaConnection, setAlibabaConnection] = useState<{ status: 'connected' | 'reconnecting' | 'disconnected'; attempt: number }>({ status: 'disconnected', attempt: 0 });
  const [connectionMessage, setConnectionMessage] = useState('');
  const [manualReconnectBusy, setManualReconnectBusy] = useState(false);
  const streamsRef = useRef<MediaStream[]>([]);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const sourceLabelRef = useRef<AudioSource>('microphone');
  const generationRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const channelGainsRef = useRef<Partial<Record<AudioChannel, GainNode>>>({});
  const channelAnalysersRef = useRef<Partial<Record<AudioChannel, AnalyserNode>>>({});
  const meterFrameRef = useRef<number | null>(null);
  const mutedChannelsRef = useRef<ChannelValues<boolean>>({ microphone: false, computer: false });
  const transcriptionChainRef = useRef<Promise<void>>(Promise.resolve());
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const analyzedSegmentsRef = useRef(new Map<string, string>());
  const [lastAnalyzedSegmentId, setLastAnalyzedSegmentId] = useState<string | null>(null);
  const startInFlightRef = useRef(false);
  const autoStartRef = useRef(false);
  const autoStartTimerRef = useRef<number | null>(null);
  const handledAnalysisRequestRef = useRef(analysisRequestId);
  const alibabaSessionActiveRef = useRef(false);
  const alibabaAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const alibabaProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const alibabaMuteRef = useRef<GainNode | null>(null);

  const canTranscribe = transcriptionProvider === 'alibaba' ? hasAlibabaApiKey && hasAlibabaWorkspaceHost : hasApiKey;

  useEffect(() => window.persona.onAlibabaTranscriptionEvent((event: AlibabaTranscriptionEvent) => {
    if (event.type === 'usage') { setAlibabaUsage({ inputTokens: event.inputTokens, outputTokens: event.outputTokens }); return; }
    if (event.type === 'connection') {
      setAlibabaConnection({ status: event.status, attempt: event.attempt });
      setConnectionMessage(event.message ?? (event.status === 'reconnecting' ? `Conexão instável. Tentando novamente (${event.attempt}/5)…` : ''));
      return;
    }
    if (event.type === 'warning') { setConnectionMessage(event.message); return; }
    if (event.type === 'error') { setError(event.message); return; }
    const text = event.text.trim();
    if (!text) return;
    const id = `alibaba-${event.sentenceId}`;
    const next = [...transcriptRef.current];
    const index = next.findIndex((segment) => segment.id === id);
    const segment: TranscriptSegment = {
      id,
      createdAt: index >= 0 ? next[index].createdAt : new Date().toISOString(),
      source: 'mixed',
      text,
    };
    if (index >= 0) next[index] = segment;
    else next.push(segment);
    transcriptRef.current = next;
    setSegments(next);
  }), []);

  const transcribe = useCallback(async (blob: Blob, generation: number) => {
    if (blob.size < 1_000) return;
    setPending((value) => value + 1);
    try {
      const text = await window.persona.transcribeAudio({
        audio: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type || 'audio/webm',
        source: sourceLabelRef.current,
      });
      if (text && generation === generationRef.current) {
        const next = [...transcriptRef.current, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: sourceLabelRef.current, text }];
        transcriptRef.current = next;
        setSegments(next);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending((value) => Math.max(0, value - 1));
    }
  }, []);

  const queueTranscription = useCallback((blob: Blob, generation: number) => {
    const job = transcriptionChainRef.current.then(() => transcribe(blob, generation));
    transcriptionChainRef.current = job.catch(() => undefined);
  }, [transcribe]);

  const startSegment = useCallback(() => {
    const stream = mixedStreamRef.current;
    if (!stream || !runningRef.current) return;
    const segmentGeneration = generationRef.current;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (chunks.length) queueTranscription(new Blob(chunks, { type: recorder.mimeType }), segmentGeneration);
      if (runningRef.current) startSegment();
    };
    recorder.start();
    recorderRef.current = recorder;
    timerRef.current = window.setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, SEGMENT_MS);
  }, [queueTranscription]);

  const releaseMedia = useCallback(() => {
    runningRef.current = false;
    alibabaProcessorRef.current?.disconnect();
    alibabaAudioSourceRef.current?.disconnect();
    alibabaMuteRef.current?.disconnect();
    alibabaProcessorRef.current = null;
    alibabaAudioSourceRef.current = null;
    alibabaMuteRef.current = null;
    if (alibabaSessionActiveRef.current) {
      alibabaSessionActiveRef.current = false;
      void window.persona.stopAlibabaTranscription();
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streamsRef.current = [];
    mixedStreamRef.current = null;
    channelGainsRef.current = {};
    channelAnalysersRef.current = {};
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    setAudioLevels({ microphone: 0, computer: 0 });
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
  }, []);

  const startMetering = useCallback(() => {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    let lastMeterUpdate = 0;
    const updateMeters = (timestamp: number) => {
      if (!runningRef.current) { meterFrameRef.current = null; return; }
      if (timestamp - lastMeterUpdate >= 90) {
        lastMeterUpdate = timestamp;
        setAudioLevels({
          microphone: channelAnalysersRef.current.microphone ? measureAudioLevel(channelAnalysersRef.current.microphone) : 0,
          computer: channelAnalysersRef.current.computer ? measureAudioLevel(channelAnalysersRef.current.computer) : 0,
        });
      }
      meterFrameRef.current = requestAnimationFrame(updateMeters);
    };
    meterFrameRef.current = requestAnimationFrame(updateMeters);
  }, []);

  useEffect(() => releaseMedia, [releaseMedia]);

  const begin = useCallback(async () => {
    if (startInFlightRef.current || state === 'starting' || state === 'recording' || state === 'ending') return;
    if (!canTranscribe) { setError(transcriptionProvider === 'alibaba' ? 'Configure a chave Alibaba e o API Host na aba Transcrição da tela Modelos.' : 'Configure a chave OpenAI antes de iniciar a transcrição.'); return; }
    startInFlightRef.current = true;
    setState('starting');
    onSessionActiveChange(true);
    setError('');
    const startGeneration = generationRef.current;
    try {
      const streams: MediaStream[] = [];
      const context = new AudioContext(transcriptionProvider === 'alibaba' ? { sampleRate: 16_000 } : undefined);
      audioContextRef.current = context;
      await context.resume();
      if (startGeneration !== generationRef.current) { releaseMedia(); return; }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('A captura de áudio não está disponível neste dispositivo.');
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (startGeneration !== generationRef.current) {
        microphone.getTracks().forEach((track) => track.stop());
        releaseMedia();
        return;
      }
      streams.push(microphone);
      streamsRef.current = streams;
      const audioSource = await window.persona.getOverlayAudioSource();
      if (startGeneration !== generationRef.current) { releaseMedia(); return; }
      if (!audioSource) throw new Error('Não foi possível localizar a tela da barra para capturar a saída de áudio do Windows.');
      const desktopConstraints = {
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: audioSource.id } },
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: audioSource.id, maxWidth: 16, maxHeight: 16, maxFrameRate: 1 } },
      } as unknown as MediaStreamConstraints;
      const desktop = await navigator.mediaDevices.getUserMedia(desktopConstraints);
      desktop.getVideoTracks().forEach((track) => track.stop());
      if (startGeneration !== generationRef.current) {
        desktop.getTracks().forEach((track) => track.stop());
        releaseMedia();
        return;
      }
      if (!desktop.getAudioTracks().length) throw new Error('O Windows não disponibilizou áudio do sistema. Verifique se há som sendo reproduzido.');
      streams.push(desktop);
      streamsRef.current = streams;
      const destination = context.createMediaStreamDestination();
      const channels: AudioChannel[] = ['microphone', 'computer'];
      streams.forEach((stream, index) => {
        const channel = channels[index];
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        const gain = context.createGain();
        gain.gain.value = mutedChannelsRef.current[channel] ? 0 : 1;
        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(destination);
        channelAnalysersRef.current[channel] = analyser;
        channelGainsRef.current[channel] = gain;
      });
      sourceLabelRef.current = 'mixed';
      mixedStreamRef.current = destination.stream;
      if (transcriptionProvider === 'alibaba') {
        setAlibabaUsage({ inputTokens: 0, outputTokens: 0 });
        setAlibabaConnection({ status: 'reconnecting', attempt: 0 });
        setConnectionMessage('Conectando ao Qwen…');
        await window.persona.startAlibabaTranscription();
        alibabaSessionActiveRef.current = true;
        const mixedSource = context.createMediaStreamSource(destination.stream);
        const processor = context.createScriptProcessor(2_048, 1, 1);
        const mute = context.createGain();
        mute.gain.value = 0;
        processor.onaudioprocess = (event) => {
          if (!runningRef.current) return;
          const samples = event.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(samples.length);
          for (let index = 0; index < samples.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, samples[index]));
            pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }
          window.persona.sendAlibabaAudioFrame(new Uint8Array(pcm.buffer));
        };
        mixedSource.connect(processor);
        processor.connect(mute);
        mute.connect(context.destination);
        alibabaAudioSourceRef.current = mixedSource;
        alibabaProcessorRef.current = processor;
        alibabaMuteRef.current = mute;
      }
      runningRef.current = true;
      setState('recording');
      startMetering();
      if (transcriptionProvider === 'openai') startSegment();
    } catch (reason) {
      releaseMedia();
      setState('setup');
      onSessionActiveChange(false);
      setError(errorMessage(reason));
    } finally {
      startInFlightRef.current = false;
    }
  }, [canTranscribe, onSessionActiveChange, releaseMedia, startMetering, startSegment, state, transcriptionProvider]);

  const reconnectAlibaba = useCallback(async () => {
    if (manualReconnectBusy || state !== 'recording') return;
    setManualReconnectBusy(true);
    setAlibabaConnection({ status: 'reconnecting', attempt: 0 });
    setConnectionMessage('Reconectando ao Qwen…');
    try {
      await window.persona.retryAlibabaTranscription();
      alibabaSessionActiveRef.current = true;
      setError('');
      setConnectionMessage('');
    } catch (reason) {
      setAlibabaConnection({ status: 'disconnected', attempt: 5 });
      setConnectionMessage(errorMessage(reason));
    } finally {
      setManualReconnectBusy(false);
    }
  }, [manualReconnectBusy, state]);

  useEffect(() => {
    if (!canTranscribe || autoStartRef.current) return;
    autoStartTimerRef.current = window.setTimeout(() => {
      autoStartRef.current = true;
      void begin();
    }, 0);
    return () => {
      if (autoStartTimerRef.current !== null) window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    };
  }, [begin, canTranscribe]);

  const toggleChannelMuted = (channel: AudioChannel) => {
    const nextMuted = !mutedChannels[channel];
    const next = { ...mutedChannelsRef.current, [channel]: nextMuted };
    mutedChannelsRef.current = next;
    setMutedChannels(next);
    const gain = channelGainsRef.current[channel];
    const context = audioContextRef.current;
    if (gain && context) gain.gain.setTargetAtTime(nextMuted ? 0 : 1, context.currentTime, 0.025);
  };

  const endSession = async () => {
    if (state !== 'recording') return;
    setState('ending');
    const recorder = recorderRef.current;
    const stopped = recorder?.state === 'recording'
      ? new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }))
      : Promise.resolve();
    if (alibabaSessionActiveRef.current) {
      alibabaProcessorRef.current?.disconnect();
      alibabaAudioSourceRef.current?.disconnect();
      alibabaMuteRef.current?.disconnect();
      alibabaSessionActiveRef.current = false;
      await window.persona.stopAlibabaTranscription();
    }
    releaseMedia();
    await stopped;
    await transcriptionChainRef.current;
    setState('finished');
    onSessionActiveChange(false);
  };

  const analyzeTranscript = async () => {
    if (isAnalyzing || isAnswerBusy || !hasApiKey || (state !== 'recording' && state !== 'finished')) return;
    const snapshot = transcriptRef.current.map((segment) => ({ ...segment }));
    const newSegments = getUnanalyzedSegments(snapshot, analyzedSegmentsRef.current);
    const transcript = newSegments.map((segment) => segment.text).join('\n');
    if (!transcript.trim()) {
      setError(snapshot.length ? 'Não há novos trechos desde a última análise.' : 'Ainda não há transcrição disponível para analisar.');
      return;
    }
    setIsAnalyzing(true);
    onAnalysisStateChange(true);
    setError('');
    try {
      const result = await window.persona.summarizeMeeting({ transcript, profileId: activeProfileId });
      for (const segment of newSegments) analyzedSegmentsRef.current.set(segment.id, segment.text);
      setLastAnalyzedSegmentId(newSegments.at(-1)?.id ?? null);
      onSummary(result.text);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsAnalyzing(false);
      onAnalysisStateChange(false);
    }
  };

  useEffect(() => {
    if (analysisRequestId === handledAnalysisRequestRef.current) return;
    handledAnalysisRequestRef.current = analysisRequestId;
    void analyzeTranscript();
  }, [analysisRequestId, analyzeTranscript]);

  const restartSession = () => {
    generationRef.current += 1;
    releaseMedia();
    transcriptRef.current = [];
    analyzedSegmentsRef.current.clear();
    setLastAnalyzedSegmentId(null);
    setSegments([]);
    setError('');
    setState('setup');
    void begin();
  };

  return (
    <div className="meeting-session" data-interactive>
      {state === 'setup' || state === 'starting' ? (
        <div className="meeting-setup">
          <p>{state === 'starting' ? 'Conectando ao microfone e ao áudio do Windows…' : 'A sessão usa o microfone e a saída de áudio do Windows. A escuta continua enquanto você consulta as respostas.'}</p>
          {state === 'setup' && <button className="meeting-primary" type="button" onClick={() => void begin()}><Mic size={17} /> {error ? 'Tentar novamente' : 'Começar a ouvir'}</button>}
          {error && <p className="meeting-error" role="alert">{error}</p>}
        </div>
      ) : (
        <>
          <div className="meeting-status"><span className={`recording-dot ${state !== 'recording' || (transcriptionProvider === 'alibaba' && alibabaConnection.status !== 'connected') ? 'is-paused' : ''}`} /><strong>{state === 'recording' ? transcriptionProvider === 'alibaba' && alibabaConnection.status !== 'connected' ? (alibabaConnection.status === 'reconnecting' ? 'Reconectando ao Qwen' : 'Qwen desconectado') : 'Sessão ativa · transcrevendo' : state === 'ending' ? 'Encerrando sessão' : 'Sessão encerrada'}</strong><span>{transcriptionProvider === 'alibaba' && state === 'recording' ? alibabaConnection.status === 'connected' ? 'Qwen conectado' : alibabaConnection.status === 'reconnecting' ? `Tentativa ${alibabaConnection.attempt}/5` : 'Aguardando reconexão' : pending ? `${pending} trecho${pending > 1 ? 's' : ''} em processamento` : 'Transcrição atualizada'}</span></div>
          {transcriptionProvider === 'alibaba' && <div className="meeting-usage" aria-live="polite">
            <div><strong>Consumo da sessão</strong><span>Entrada {alibabaUsage.inputTokens.toLocaleString('pt-BR')} · saída {alibabaUsage.outputTokens.toLocaleString('pt-BR')} tokens</span></div>
            <strong className="meeting-usage-cost">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(alibabaTranscriptionCost(alibabaWorkspaceHost, alibabaUsage.inputTokens, alibabaUsage.outputTokens))}</strong>
            <small>Estimativa acumulada · {alibabaWorkspaceHost.toLowerCase().includes('.cn-beijing.') ? 'Pequim' : 'Singapura'}</small>
          </div>}
          {transcriptionProvider === 'alibaba' && connectionMessage && <div className={`meeting-connection ${alibabaConnection.status === 'disconnected' ? 'is-error' : ''}`} role={alibabaConnection.status === 'disconnected' ? 'alert' : 'status'}>
            {alibabaConnection.status === 'disconnected' ? <WifiOff size={15} /> : <Wifi size={15} />}
            <span>{connectionMessage}</span>
            {alibabaConnection.status === 'disconnected' && state === 'recording' && <button type="button" onClick={() => void reconnectAlibaba()} disabled={manualReconnectBusy}>{manualReconnectBusy ? <RefreshCw size={13} className="is-spinning" /> : <RefreshCw size={13} />}Reconectar</button>}
          </div>}
          {state === 'recording' && <section className="meeting-meters" aria-label="Medidores e controles de áudio">
            <AudioChannelMeter channel="microphone" level={audioLevels.microphone} muted={mutedChannels.microphone} onToggleMute={() => toggleChannelMuted('microphone')} />
            <AudioChannelMeter channel="computer" level={audioLevels.computer} muted={mutedChannels.computer} onToggleMute={() => toggleChannelMuted('computer')} />
          </section>}
          <div className="transcript" aria-live="polite">
            {segments.map((segment) => <div className="transcript-entry" key={segment.id}><p><time>{new Date(segment.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>{segment.text}</p>{segment.id === lastAnalyzedSegmentId && <div className="transcript-analysis-marker" role="note">Última análise até aqui</div>}</div>)}
            {!segments.length && <p className="transcript-empty">{transcriptionProvider === 'alibaba' ? 'A transcrição ao vivo do Qwen aparecerá aqui enquanto você fala. Você pode abrir a aba Respostas sem encerrar a sessão.' : 'A transcrição aparecerá aqui em blocos de cerca de 12 segundos. Você pode abrir a aba Respostas sem encerrar a sessão.'}</p>}
          </div>
          {error && <p className="meeting-error" role="alert">{error}</p>}
          <footer className="meeting-controls">
            {(state === 'recording' || state === 'finished') && <button className="meeting-primary" type="button" disabled={!hasApiKey || !segments.length || pending > 0 || isAnalyzing || isAnswerBusy} title={!hasApiKey ? 'Configure também a chave OpenAI para gerar análises.' : undefined} onClick={() => void analyzeTranscript()}><Sparkles size={15} />{isAnalyzing ? 'Analisando transcrição…' : 'Gerar análise'}</button>}
            {state === 'recording' && <button className="discard-button" type="button" onClick={() => void endSession()}><CircleStop size={16} /> Encerrar sessão</button>}
            {state === 'ending' && <button className="discard-button" type="button" disabled><CircleStop size={16} /> Finalizando…</button>}
            {state === 'finished' && <button type="button" onClick={restartSession}><AudioLines size={15} /> Começar outra sessão</button>}
          </footer>
        </>
      )}
    </div>
  );
}
