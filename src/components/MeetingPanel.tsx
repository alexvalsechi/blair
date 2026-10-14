import { AudioLines, CircleStop, FileText, GripVertical, Mic, Pause, Play, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AudioSource, TranscriptSegment } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { useDragPosition } from '../lib/useDragPosition';

type Props = {
  hasApiKey: boolean;
  onClose(): void;
  onSummary(text: string, keepPanelOpen: boolean): void;
};

type MeetingState = 'setup' | 'starting' | 'recording' | 'paused' | 'summarizing' | 'finished';

const SEGMENT_MS = 12_000;

export function MeetingPanel({ hasApiKey, onClose, onSummary }: Props) {
  const [state, setState] = useState<MeetingState>('setup');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const streamsRef = useRef<MediaStream[]>([]);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const sourceLabelRef = useRef<AudioSource>('microphone');
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const generationRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const transcriptionChainRef = useRef<Promise<void>>(Promise.resolve());
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const startInFlightRef = useRef(false);
  const autoStartRef = useRef(false);
  const autoStartTimerRef = useRef<number | null>(null);
  const panelDrag = useDragPosition({ x: 0, y: 0 });

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
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streamsRef.current = [];
    mixedStreamRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
  }, []);

  useEffect(() => releaseMedia, [releaseMedia]);

  const begin = useCallback(async () => {
    if (startInFlightRef.current || state === 'starting' || state === 'recording' || state === 'summarizing') return;
    if (!hasApiKey) { setError('Configure a chave OpenAI antes de iniciar a transcrição.'); return; }
    startInFlightRef.current = true;
    setState('starting');
    setError('');
    const startGeneration = generationRef.current;
    try {
      const streams: MediaStream[] = [];
      const context = new AudioContext();
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
      sourceLabelRef.current = 'mixed';
      const destination = context.createMediaStreamDestination();
      streams.forEach((stream) => context.createMediaStreamSource(stream).connect(destination));
      mixedStreamRef.current = destination.stream;
      runningRef.current = true;
      setState('recording');
      startSegment();
    } catch (reason) {
      releaseMedia();
      setState('setup');
      setError(errorMessage(reason));
    } finally {
      startInFlightRef.current = false;
    }
  }, [hasApiKey, releaseMedia, startSegment, state]);

  useEffect(() => {
    if (!hasApiKey || autoStartRef.current) return;
    autoStartTimerRef.current = window.setTimeout(() => {
      autoStartRef.current = true;
      void begin();
    }, 0);
    return () => {
      if (autoStartTimerRef.current !== null) window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    };
  }, [begin, hasApiKey]);

  const pause = () => {
    runningRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamsRef.current.forEach((stream) => stream.getAudioTracks().forEach((track) => { track.enabled = false; }));
    setState('paused');
  };

  const resume = () => {
    streamsRef.current.forEach((stream) => stream.getAudioTracks().forEach((track) => { track.enabled = true; }));
    runningRef.current = true;
    setState('recording');
    startSegment();
  };

  const finish = async () => {
    if (state !== 'recording' && state !== 'paused') return;
    setState('summarizing');
    const recorder = recorderRef.current;
    const stopped = recorder?.state === 'recording'
      ? new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }))
      : Promise.resolve();
    releaseMedia();
    await stopped;
    await transcriptionChainRef.current;
    const transcript = transcriptRef.current.map((segment) => segment.text).join('\n');
    if (!transcript.trim()) { setState('finished'); setError('Nenhuma fala foi transcrita.'); return; }
    try {
      const result = await window.persona.summarizeMeeting({ transcript });
      onSummary(result.text, false);
      transcriptRef.current = [];
      setSegments([]);
    } catch (reason) {
      setState('paused');
      setError(errorMessage(reason));
    }
  };

  const discard = () => {
    generationRef.current += 1;
    releaseMedia();
    transcriptRef.current = [];
    setSegments([]);
    setError('');
    setState('setup');
  };

  const close = useCallback(() => {
    generationRef.current += 1;
    releaseMedia();
    onClose();
  }, [onClose, releaseMedia]);

  useEffect(() => window.persona.onShortcut((action) => {
    if (action !== 'meeting') return;
    if (state === 'recording' || state === 'paused') void finish();
    else if (state === 'setup') void begin();
    else if (state === 'finished') close();
  }), [begin, close, finish, state]);

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (state === 'recording') pause();
        else if (state !== 'summarizing') close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, state]);

  return (
    <div className="meeting-backdrop" data-interactive>
    <section ref={panelRef} className="meeting-panel glass-surface" style={{ ['--drag-x' as string]: `${panelDrag.offset.x}px`, ['--drag-y' as string]: `${panelDrag.offset.y}px` }} role="dialog" aria-modal="true" aria-labelledby="meeting-title">
      <header className="meeting-header">
        <div className="meeting-heading-copy">
          <h2 id="meeting-title" className="drag-grip" tabIndex={0} onMouseDown={panelDrag.startDrag} onKeyDown={(event) => {
            const distance = event.shiftKey ? 30 : 10;
            if (event.key === 'ArrowLeft') panelDrag.moveBy(-distance, 0);
            else if (event.key === 'ArrowRight') panelDrag.moveBy(distance, 0);
            else if (event.key === 'ArrowUp') panelDrag.moveBy(0, -distance);
            else if (event.key === 'ArrowDown') panelDrag.moveBy(0, distance);
            else return;
            event.preventDefault();
          }} title="Arraste para mover a janela. Use as setas para mover pelo teclado."><GripVertical size={15} aria-hidden="true" /><AudioLines size={20} /> Reunião ao vivo</h2>
          <p>Microfone e áudio do Windows são transcritos ao vivo. Ctrl+D envia a transcrição para gerar uma resposta.</p>
        </div>
        <button ref={closeButtonRef} className="icon-button" type="button" aria-label="Fechar reunião" onClick={close}><X size={18} /></button>
      </header>

      {state === 'setup' || state === 'starting' ? (
        <div className="meeting-setup">
          <p>{state === 'starting' ? 'Conectando ao microfone e ao áudio do Windows…' : 'A transcrição ao vivo usa seu microfone e a saída de áudio do Windows.'}</p>
          {state === 'setup' && <button className="meeting-primary" type="button" onClick={() => void begin()}><Mic size={17} /> {error ? 'Tentar novamente' : 'Começar a ouvir'}</button>}
        </div>
      ) : (
        <>
          <div className="meeting-status"><span className={`recording-dot ${state === 'paused' || state === 'finished' ? 'is-paused' : ''}`} /><strong>{state === 'recording' ? 'Transcrevendo' : state === 'paused' ? 'Pausada' : state === 'summarizing' ? 'Gerando resposta' : 'Finalizada'}</strong><span>{pending ? `${pending} trecho${pending > 1 ? 's' : ''} em processamento` : 'Nenhum trecho pendente'}</span></div>
          <div className="transcript" aria-live="polite">
            {segments.map((segment) => <p key={segment.id}><time>{new Date(segment.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>{segment.text}</p>)}
            {!segments.length && <p className="transcript-empty">A transcrição aparecerá aqui em blocos de cerca de 12 segundos.</p>}
          </div>
          {error && <p className="meeting-error" role="alert">{error}</p>}
          <footer className="meeting-controls">
            {state === 'recording' && <button type="button" onClick={pause}><Pause size={16} /> Pausar</button>}
            {state === 'paused' && mixedStreamRef.current && <button type="button" onClick={resume}><Play size={16} /> Continuar</button>}
            {(state === 'recording' || state === 'paused') && <button className="meeting-primary" type="button" disabled={!segments.length || pending > 0} onClick={() => void finish()}><CircleStop size={16} /> Gerar resposta · Ctrl+D</button>}
            {state === 'finished' && <button className="meeting-primary" type="button" onClick={close}><FileText size={16} /> Ver resposta</button>}
            <button className="discard-button" type="button" onClick={discard}><Trash2 size={16} /> Descartar</button>
          </footer>
        </>
      )}
      {state === 'setup' && error && <p className="meeting-error" role="alert">{error}</p>}
    </section>
    </div>
  );
}
