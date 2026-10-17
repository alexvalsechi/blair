import {
  ArrowUp,
  AudioLines,
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  GripVertical,
  Mic,
  Layers3,
  Minus,
  MessageSquareText,
  Paperclip,
  Pin,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from 'lucide-react';
import { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantProfile, Attachment, MemoryContext, ShortcutAction, StreamEvent, TokenUsage } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { KeyHint } from './KeyHint';
import { MeetingPanel } from './MeetingPanel';
import { ContextPanel } from './ContextPanel';
import { AnswerContent } from './AnswerContent';
import { useDragPosition } from '../lib/useDragPosition';
import { useLiveInsights } from '../lib/useLiveInsights';

type AnswerState =
  | { status: 'idle'; text: string }
  | { status: 'loading'; text: string }
  | { status: 'success'; text: string; requestId?: string }
  | { status: 'error'; text: string };
type AnswerHistoryItem = { id: string; text: string };
type ResponseTab = 'transcript' | 'answers';

const initialAnswer: AnswerState = {
  status: 'idle',
  text: 'Persona está pronta. Faça uma pergunta ou capture a tela para receber uma resposta aqui.',
};

export function Overlay() {
  const [settings, setSettings] = useState({ opacity: 0.86, hasApiKey: false, hasAlibabaApiKey: false, hasTypeSafeApiKey: false, analysisProvider: 'openai' as 'openai' | 'alibaba', alibabaWorkspaceHost: '', transcriptionProvider: 'openai' as 'openai' | 'alibaba', model: 'gpt-5.5', scale: 1, layoutPosition: 'center' });
  const hasAnalysisApiKey = settings.analysisProvider === 'alibaba' ? settings.hasAlibabaApiKey : settings.hasApiKey;
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState('');
  const [pendingCapture, setPendingCapture] = useState<string | null>(null);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [answerFontSize, setAnswerFontSize] = useState(16);
  const [answerSize, setAnswerSize] = useState<{ width: number; height: number; left: number; top: number; dragOriginX: number; dragOriginY: number } | null>(null);
  const answerPanelRef = useRef<HTMLElement>(null);
  const answerResizeRef = useRef<{ pointerId: number; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const [dockVisible, setDockVisible] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [interactionMode, setInteractionMode] = useState(false);
  const [answer, setAnswer] = useState<AnswerState>(initialAnswer);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [answerHistory, setAnswerHistory] = useState<AnswerHistoryItem[]>([]);
  const [pdfExportStatus, setPdfExportStatus] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const answerCopyRef = useRef<HTMLDivElement>(null);
  const followAnswerRef = useRef(true);
  const streamTextRef = useRef('');
  const streamFlushTimerRef = useRef<number | null>(null);
  const [responseTab, setResponseTab] = useState<ResponseTab>('answers');
  const [isCapturing, setIsCapturing] = useState(false);
  const captureInFlight = useRef(false);
  const submittedDraftRef = useRef<{ prompt: string; imageDataUrl?: string; attachments: Attachment[]; selectedMemory: MemoryContext[] } | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingActive, setMeetingActive] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [insightFontSize, setInsightFontSize] = useState(14);
  const [meetingIsAnalyzing, setMeetingIsAnalyzing] = useState(false);
  const [transcriptAnalysisRequestId, setTranscriptAnalysisRequestId] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const agentSwitcherRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<AssistantProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem('persona.activeProfile') ?? 'general');
  const { insight, suggestions, suggestionIndex, navigateSuggestions, onTranscript, onSessionActiveChange: onInsightSessionChange } = useLiveInsights({ profileId: activeProfileId, hasTypeSafeApiKey: settings.hasTypeSafeApiKey, hasAnalysisApiKey });
  const onMeetingSessionChange = useCallback((active: boolean) => { setMeetingActive(active); onInsightSessionChange(active); }, [onInsightSessionChange]);
  const [selectedMemory, setSelectedMemory] = useState<MemoryContext[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptDrag = useDragPosition({ x: 0, y: 0 }, 'persona.overlay.prompt-position');
  const answerDrag = useDragPosition({ x: 0, y: 0 }, 'persona.overlay.answer-position');
  const insightDrag = useDragPosition({ x: 0, y: 0 }, 'persona.overlay.insight-position');
  const dockDrag = useDragPosition({ x: 0, y: 0 }, 'persona.overlay.dock-position');

  const exportAnswerPdf = async () => {
    const answerElement = answerCopyRef.current;
    if (!answerElement || isExportingPdf) return;
    setIsExportingPdf(true);
    setPdfExportStatus('Preparando PDF…');
    try {
      await document.fonts.ready;
      const diagramDeadline = Date.now() + 10_000;
      while (answerElement.querySelector('.d2-diagram-loading') && Date.now() < diagramDeadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      const content = answerElement.cloneNode(true) as HTMLDivElement;
      content.querySelectorAll('script, button, input, textarea, select').forEach((element) => element.remove());
      content.querySelectorAll('.thinking-line').forEach((element) => element.remove());
      content.querySelectorAll<HTMLElement>('*').forEach((element) => {
        for (const attribute of Array.from(element.attributes)) {
          if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
        }
      });
      const path = await window.persona.exportAnswerPdf(content.innerHTML);
      setPdfExportStatus(`PDF salvo em ${path}`);
    } catch (error) {
      setPdfExportStatus(`Falha ao exportar: ${errorMessage(error)}`);
    } finally {
      setIsExportingPdf(false);
      window.setTimeout(() => setPdfExportStatus(''), 8000);
    }
  };

  useEffect(() => {
    const publishInteractiveRegions = () => {
      const regions = Array.from(document.querySelectorAll<HTMLElement>('[data-interactive]')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      window.persona.setInteractiveRegions(regions);
    };
    let animationFrame = 0;
    const schedulePublish = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = requestAnimationFrame(publishInteractiveRegions);
      });
    };
    publishInteractiveRegions();
    schedulePublish();
    void document.fonts.ready.then(schedulePublish);
    const observer = new ResizeObserver(schedulePublish);
    observer.observe(document.documentElement);
    document.querySelectorAll<HTMLElement>('[data-interactive]').forEach((element) => observer.observe(element));
    window.addEventListener('resize', schedulePublish);
    window.addEventListener('load', schedulePublish);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', schedulePublish);
      window.removeEventListener('load', schedulePublish);
      window.persona.setInteractiveRegions([]);
    };
  }, [promptOpen, answerOpen, dockVisible, meetingOpen, meetingActive, insightCollapsed, insight.status, insight.text, contextOpen, agentMenuOpen, attachments.length, selectedMemory.length, Boolean(pendingCapture), Boolean(promptError), promptDrag.offset.x, promptDrag.offset.y, answerDrag.offset.x, answerDrag.offset.y, insightDrag.offset.x, insightDrag.offset.y, dockDrag.offset.x, dockDrag.offset.y]);

  useEffect(() => {
    void window.persona.getSettings().then((value) => {
      setSettings({ opacity: value.opacity, hasApiKey: value.hasApiKey, hasAlibabaApiKey: value.hasAlibabaApiKey, hasTypeSafeApiKey: value.hasTypeSafeApiKey, analysisProvider: value.analysisProvider, alibabaWorkspaceHost: value.alibabaWorkspaceHost, transcriptionProvider: value.transcriptionProvider, model: value.model, scale: value.scale, layoutPosition: value.layoutPosition });
    });
  }, []);

  useEffect(() => window.persona.onSettingsUpdated((value) => {
    setSettings({ opacity: value.opacity, hasApiKey: value.hasApiKey, hasAlibabaApiKey: value.hasAlibabaApiKey, hasTypeSafeApiKey: value.hasTypeSafeApiKey, analysisProvider: value.analysisProvider, alibabaWorkspaceHost: value.alibabaWorkspaceHost, transcriptionProvider: value.transcriptionProvider, model: value.model, scale: value.scale, layoutPosition: value.layoutPosition });
  }), []);

  useEffect(() => { void window.persona.listProfiles().then(setProfiles); }, []);
  useEffect(() => { localStorage.setItem('persona.activeProfile', activeProfileId); }, [activeProfileId]);
  useEffect(() => {
    const syncActiveProfile = (event: StorageEvent) => {
      if (event.key === 'persona.activeProfile' && event.newValue) setActiveProfileId(event.newValue);
      if (event.key === 'persona.profilesUpdatedAt') void window.persona.listProfiles().then(setProfiles);
    };
    window.addEventListener('storage', syncActiveProfile);
    return () => window.removeEventListener('storage', syncActiveProfile);
  }, []);
  useEffect(() => {
    if (!agentMenuOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !agentSwitcherRef.current?.contains(event.target)) setAgentMenuOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAgentMenuOpen(false); };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromEscape);
    };
  }, [agentMenuOpen]);

  useEffect(() => {
    const unsubscribe = window.persona.onStream((event: StreamEvent) => {
      if (event.type === 'delta') {
        streamTextRef.current += event.text;
        if (streamFlushTimerRef.current === null) {
          streamFlushTimerRef.current = window.setTimeout(() => {
            streamFlushTimerRef.current = null;
            setAnswer((current) => current.status === 'loading' ? { status: 'loading', text: streamTextRef.current } : current);
          }, 80);
        }
      }
      if (event.type === 'done') {
        if (streamFlushTimerRef.current !== null) window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
        submittedDraftRef.current = null;
        setTokenUsage(event.usage ?? null);
        setAnswer({ status: 'success', text: streamTextRef.current, requestId: event.requestId });
      }
      if (event.type === 'incomplete') {
        if (streamFlushTimerRef.current !== null) window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
        submittedDraftRef.current = null;
        setTokenUsage(event.usage ?? null);
        const notice = `\n\n---\n\n> **Resposta incompleta:** ${event.message}`;
        setAnswer({ status: 'success', text: `${streamTextRef.current}${notice}` });
      }
      if (event.type === 'cancelled') {
        if (streamFlushTimerRef.current !== null) window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
        const draft = submittedDraftRef.current;
        submittedDraftRef.current = null;
        if (draft) {
          setPrompt(draft.prompt);
          setPendingCapture(draft.imageDataUrl ?? null);
          setAttachments(draft.attachments);
          setSelectedMemory(draft.selectedMemory);
          setPromptOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        setAnswer({ status: 'success', text: streamTextRef.current || 'Solicitação cancelada.' });
      }
      if (event.type === 'error') {
        if (streamFlushTimerRef.current !== null) window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
        const draft = submittedDraftRef.current;
        submittedDraftRef.current = null;
        if (draft) {
          setPrompt(draft.prompt);
          setPendingCapture(draft.imageDataUrl ?? null);
          setAttachments(draft.attachments);
          setSelectedMemory(draft.selectedMemory);
          setPromptError(event.message);
          setPromptOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        const partial = streamTextRef.current;
        setAnswer({ status: 'error', text: partial ? `${partial}\n\n**Falha ao concluir:** ${event.message}` : event.message });
      }
    });
    return () => {
      unsubscribe();
      if (streamFlushTimerRef.current !== null) window.clearTimeout(streamFlushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const copy = answerCopyRef.current;
    if (copy && followAnswerRef.current) copy.scrollTop = copy.scrollHeight;
  }, [answer.text, answer.status]);

  const openPrompt = useCallback(async () => {
    await window.persona.focusOverlay();
    setAlwaysOnTop(true);
    setPromptError('');
    setPromptOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const openMeeting = useCallback(() => {
    setMeetingOpen(true);
    setAnswerOpen(true);
    setResponseTab('transcript');
  }, []);

  const submit = useCallback(
    async () => {
      if (answer.status === 'loading' || meetingIsAnalyzing || captureInFlight.current) return;
      await window.persona.focusOverlay();
      setAlwaysOnTop(true);
      if (!hasAnalysisApiKey) {
        setPromptError(settings.analysisProvider === 'alibaba' ? 'Configure a chave da Alibaba Cloud para enviar.' : 'Configure a chave OpenAI para enviar.');
        setPromptOpen(true);
        await window.persona.openSettings();
        return;
      }
      if (!prompt.trim() && !pendingCapture && !attachments.length) {
        openPrompt();
        return;
      }

      if (answer.status === 'success' && answer.text.trim()) {
        setAnswerHistory((current) => [...current, { id: crypto.randomUUID(), text: answer.text }]);
      }
      const imageDataUrl = pendingCapture ?? undefined;
      submittedDraftRef.current = { prompt, imageDataUrl, attachments, selectedMemory };
      setPromptError('');
      setTokenUsage(null);
      setAnswerOpen(true);
      setResponseTab('answers');
      streamTextRef.current = '';
      followAnswerRef.current = true;
      if (streamFlushTimerRef.current !== null) window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
      setAnswer({ status: 'loading', text: imageDataUrl ? 'Analisando a captura…' : 'Pensando na sua pergunta…' });
      try {
        window.persona.askStream({ prompt: prompt.trim(), imageDataUrl, profileId: activeProfileId, attachments, contextEntries: selectedMemory });
        setAnswer({ status: 'loading', text: '' });
        setPrompt('');
        setPendingCapture(null);
        setAttachments([]);
        setSelectedMemory([]);
        setPromptOpen(false);
      } catch (error) {
        const draft = submittedDraftRef.current;
        submittedDraftRef.current = null;
        if (draft) {
          setPrompt(draft.prompt);
          setPendingCapture(draft.imageDataUrl ?? null);
          setAttachments(draft.attachments);
          setSelectedMemory(draft.selectedMemory);
          setPromptError(errorMessage(error));
          setPromptOpen(true);
        }
        setAnswer({ status: 'error', text: errorMessage(error) });
      }
    },
    [activeProfileId, answer, attachments, hasAnalysisApiKey, meetingIsAnalyzing, openPrompt, pendingCapture, prompt, selectedMemory, settings.analysisProvider],
  );

  const addAttachments = async () => {
    try {
      const selected = await window.persona.selectAttachments();
      setAttachments((current) => [...current, ...selected].slice(0, 5));
      if (selected.length) openPrompt();
    } catch (error) {
      setAnswerOpen(true); setAnswer({ status: 'error', text: errorMessage(error) });
    }
  };

  const openCapture = useCallback(async () => {
    if (captureInFlight.current || answer.status === 'loading' || meetingIsAnalyzing) return;
    captureInFlight.current = true;
    setIsCapturing(true);
    try {
      const source = await window.persona.captureOverlayScreen();
      if (!source) throw new Error('Não foi possível capturar a tela onde a barra do Persona está posicionada.');
      setPendingCapture(source.dataUrl);
      setPromptError('');
      await openPrompt();
    } catch (error) {
      await openPrompt();
      setPromptError(errorMessage(error));
    } finally {
      captureInFlight.current = false;
      setIsCapturing(false);
    }
  }, [answer.status, meetingIsAnalyzing, openPrompt]);

  useEffect(() => {
    return window.persona.onShortcut((action: ShortcutAction) => {
      if (action === 'ask') {
        if (promptOpen && (prompt.trim() || pendingCapture || attachments.length)) void submit();
        else openPrompt();
      }
      if (action === 'capture') void openCapture();
      if (action === 'meeting') {
        if (meetingOpen) {
          setResponseTab('transcript');
          setTranscriptAnalysisRequestId((requestId) => requestId + 1);
        }
        else openMeeting();
      }
      if (action === 'toggle-dock') setDockVisible((visible) => !visible);
      if (action === 'toggle-always-on-top') setAlwaysOnTop((value) => !value);
      if (action === 'toggle-interaction') {
        setInteractionMode((value) => {
          const next = !value;
          window.persona.setClickThrough(!next);
          return next;
        });
      }
      if (action === 'opacity-up' || action === 'opacity-down') {
        void window.persona.getSettings().then((value) =>
          setSettings((current) => ({ ...current, opacity: value.opacity })),
        );
      }
    });
  }, [attachments.length, meetingOpen, openCapture, openMeeting, openPrompt, pendingCapture, prompt, promptOpen, submit]);

  const changeOpacity = async (value: number) => {
    const saved = await window.persona.setOpacity(value);
    setSettings((current) => ({ ...current, opacity: saved.opacity }));
  };

  const adjustAnswerFont = (amount: number) => setAnswerFontSize((size) => Math.min(28, Math.max(12, size + amount)));

  const startAnswerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const panel = answerPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startWidth = panel.offsetWidth;
    const startHeight = panel.offsetHeight;
    answerResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startWidth, startHeight };
    window.persona.beginOverlayDrag();
    document.body.dataset.dragging = 'true';
    setAnswerSize({ width: startWidth, height: startHeight, left: rect.left, top: rect.top, dragOriginX: answerDrag.offset.x, dragOriginY: answerDrag.offset.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeAnswer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = answerResizeRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const scale = Math.max(settings.scale, 0.5);
    const panel = answerPanelRef.current;
    const current = answerSize;
    if (!panel || !current) return;
    setAnswerSize({
      ...current,
      width: Math.max(120, start.startWidth + (event.clientX - start.startX) / scale),
      height: Math.max(80, start.startHeight + (event.clientY - start.startY) / scale),
    });
  };

  const stopAnswerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answerResizeRef.current?.pointerId !== event.pointerId) return;
    answerResizeRef.current = null;
    delete document.body.dataset.dragging;
    window.persona.endOverlayDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resizeAnswerByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const amount = event.shiftKey ? 24 : 8;
    const panel = answerPanelRef.current;
    if (!panel) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setAnswerSize((size) => {
        const rect = panel.getBoundingClientRect();
        const base = size ?? { width: panel.offsetWidth, height: panel.offsetHeight, left: rect.left, top: rect.top, dragOriginX: answerDrag.offset.x, dragOriginY: answerDrag.offset.y };
        return { ...base, width: Math.max(120, base.width + (event.key === 'ArrowRight' ? amount : -amount)) };
      });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setAnswerSize((size) => {
        const rect = panel.getBoundingClientRect();
        const base = size ?? { width: panel.offsetWidth, height: panel.offsetHeight, left: rect.left, top: rect.top, dragOriginX: answerDrag.offset.x, dragOriginY: answerDrag.offset.y };
        return { ...base, height: Math.max(80, base.height + (event.key === 'ArrowDown' ? amount : -amount)) };
      });
    }
  };

  return (
    <main className={`overlay-stage layout-${settings.layoutPosition}`} style={{ ['--overlay-scale' as string]: settings.scale }} aria-label="Persona — assistente de reunião">
      {promptOpen && (
        <form
          className="prompt-rail glass-surface"
          style={{ ['--drag-x' as string]: `${promptDrag.offset.x}px`, ['--drag-y' as string]: `${promptDrag.offset.y}px` }}
          data-interactive
          onPointerDown={promptDrag.startDrag}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <span className="drag-grip" title="Arraste a área livre para mover a pergunta"><Sparkles size={20} className="accent-icon" aria-hidden="true" /></span>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onFocus={() => void window.persona.focusOverlay()}
            placeholder="Pergunte sem sair da reunião…"
            aria-label="Pergunta para a IA"
          />
          <KeyHint keys={['Ctrl', 'Enter']} />
          <button className="send-button" type="submit" disabled={(!prompt.trim() && !attachments.length && !pendingCapture) || answer.status === 'loading'} aria-label="Enviar pergunta">
            <ArrowUp size={20} />
          </button>
          <button className="icon-button prompt-close-button" type="button" title="Fechar pergunta e descartar a captura pendente" aria-label="Fechar janela de input" onClick={() => { setPendingCapture(null); setPromptError(''); setPromptOpen(false); }}>
            <X size={18} />
          </button>
          {pendingCapture && <div className="pending-capture-preview"><img src={pendingCapture} alt="Prévia da captura anexada" /><span>Captura anexada</span><button type="button" aria-label="Remover captura anexada" title="Remover captura" onClick={() => setPendingCapture(null)}><X size={14} /></button></div>}
          <div className="prompt-context-row">
            <button type="button" onClick={() => setContextOpen(true)}><Layers3 size={14} /> {profiles.find((item) => item.id === activeProfileId)?.name ?? 'Copiloto geral'}{selectedMemory.length > 0 && <span>{selectedMemory.length} memória{selectedMemory.length > 1 ? 's' : ''}</span>}</button>
            <button type="button" onClick={() => void openCapture()} disabled={isCapturing || answer.status === 'loading'}><Camera size={14} /> {isCapturing ? 'Capturando…' : 'Capturar tela'}</button>
            <button type="button" onClick={() => void addAttachments()}><Paperclip size={14} /> Anexar</button>
            {attachments.map((attachment) => <span className="attachment-chip" key={attachment.id}>{attachment.name}<button type="button" aria-label={`Remover ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}><X size={12} /></button></span>)}
          </div>
          {promptError && <p className="prompt-error" role="alert">{promptError}</p>}
        </form>
      )}

      {meetingActive && <aside className={`insight-panel glass-surface ${insightCollapsed ? 'is-collapsed' : ''}`} style={{ ['--drag-x' as string]: `${insightDrag.offset.x}px`, ['--drag-y' as string]: `${insightDrag.offset.y}px` }} data-interactive aria-label="Resposta sugerida">
        <header className="insight-header drag-grip" tabIndex={0} title="Arraste para mover. Use as setas para ajustar a posição." onPointerDown={insightDrag.startDrag} onKeyDown={(event) => { if (event.target !== event.currentTarget || !event.key.startsWith('Arrow')) return; event.preventDefault(); insightDrag.moveBy(event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0, event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0); }}>
          <span className="insight-heading"><Sparkles size={15} aria-hidden="true" /> Resposta sugerida</span>
          <span className="insight-header-actions"><span className={`insight-status-dot ${insight.status}`} aria-hidden="true" /><button className="icon-button" type="button" aria-label={insightCollapsed ? 'Expandir resposta sugerida' : 'Recolher resposta sugerida'} aria-expanded={!insightCollapsed} onClick={() => setInsightCollapsed((value) => !value)}>{insightCollapsed ? <Plus size={16} /> : <Minus size={16} />}</button></span>
        </header>
        {!insightCollapsed && <div className="insight-body" aria-live="polite">
          {insight.text ? <div className="insight-text" style={{ fontSize: `${insightFontSize}px` }}><AnswerContent text={insight.text} /></div> : <p className="insight-placeholder">{insight.status === 'missing-key' ? 'Insights aguardando configuração.' : insight.status === 'loading' ? 'Preparando sugestão…' : 'Aguardando uma pergunta ou dúvida clara.'}</p>}
          {insight.status === 'loading' && insight.text && <span className="insight-meta">Analisando a fala recente…</span>}
          {insight.message && <p className="insight-message" role={insight.status === 'error' ? 'alert' : 'status'}>{insight.message}</p>}
          {insight.status === 'missing-key' && <button type="button" className="insight-configure" onClick={() => void window.persona.openSettings()}>Configurar TypeSafe</button>}
        </div>}
        {!insightCollapsed && suggestions.length > 0 && <footer className="insight-controls" aria-label="Controles das respostas sugeridas">
          <div className="insight-pagination">
            <button className="icon-button" type="button" aria-label="Resposta sugerida anterior" title="Resposta sugerida anterior" disabled={suggestionIndex <= 0} onClick={() => navigateSuggestions(-1)}><ChevronLeft size={16} /></button>
            <span aria-live="polite">{suggestionIndex + 1} / {suggestions.length}</span>
            <button className="icon-button" type="button" aria-label="Próxima resposta sugerida" title="Próxima resposta sugerida" disabled={suggestionIndex >= suggestions.length - 1} onClick={() => navigateSuggestions(1)}><ChevronRight size={16} /></button>
          </div>
          <div className="insight-font-controls" aria-label="Tamanho da fonte">
            <button className="icon-button" type="button" aria-label="Diminuir fonte da resposta sugerida" title="Diminuir fonte" disabled={insightFontSize <= 11} onClick={() => setInsightFontSize((size) => Math.max(11, size - 1))}><Minus size={14} /></button>
            <span aria-label={`Fonte ${insightFontSize} pixels`}>A</span>
            <button className="icon-button" type="button" aria-label="Aumentar fonte da resposta sugerida" title="Aumentar fonte" disabled={insightFontSize >= 24} onClick={() => setInsightFontSize((size) => Math.min(24, size + 1))}><Plus size={14} /></button>
          </div>
        </footer>}
      </aside>}

      {(answerOpen || meetingOpen) && (
        <section ref={answerPanelRef} className={`answer-panel glass-surface answer-${answer.status} ${meetingOpen ? 'has-meeting-tabs' : ''}`} style={{ ['--drag-x' as string]: `${answerDrag.offset.x}px`, ['--drag-y' as string]: `${answerDrag.offset.y}px`, ...(answerSize ? { width: `${answerSize.width}px`, height: `${answerSize.height}px`, left: `${answerSize.left}px`, top: `${answerSize.top}px`, transform: `translate(${answerDrag.offset.x - answerSize.dragOriginX}px, ${answerDrag.offset.y - answerSize.dragOriginY}px) scale(var(--overlay-scale, 1))`, transformOrigin: 'top left', paddingInline: `${Math.max(6, Math.min(26, (answerSize.width - 120) / 2))}px` } : {}) }} data-interactive aria-live="polite">
          <header className="answer-header drag-grip" onPointerDown={answerDrag.startDrag}>
            <span className="answer-title" aria-label="Resposta" title="Arraste o cabeçalho para mover a resposta"><MessageSquareText size={19} /><span>Resposta</span></span>
            <span className="answer-actions">
              <button
                className={`icon-button ${alwaysOnTop ? 'is-active' : ''}`}
                type="button"
                title="Sempre no topo"
                aria-label="Alternar sempre no topo"
                onClick={() => setAlwaysOnTop((value) => !value)}
              >
                <Pin size={17} />
              </button>
              {meetingActive ? <span className="answer-session-indicator"><span className="recording-dot" />Escutando</span> : <button className="icon-button" type="button" aria-label="Fechar respostas" onClick={() => { setAnswerOpen(false); setMeetingOpen(false); }}>
                <X size={18} />
              </button>}
            </span>
          </header>

          {meetingOpen && <nav className="answer-tabs" role="tablist" aria-label="Conteúdo da janela de respostas">
            <button type="button" role="tab" aria-selected={responseTab === 'transcript'} className={responseTab === 'transcript' ? 'is-active' : ''} onClick={() => setResponseTab('transcript')}><AudioLines size={14} />Transcrição{meetingActive && <span className="answer-tab-live-dot" />}</button>
            <button type="button" role="tab" aria-selected={responseTab === 'answers'} className={responseTab === 'answers' ? 'is-active' : ''} onClick={() => setResponseTab('answers')}><MessageSquareText size={14} />Respostas{answerHistory.length > 0 && <small>{answerHistory.length + (answer.status === 'success' && answer.text.trim() ? 1 : 0)}</small>}</button>
          </nav>}

          <div ref={answerCopyRef} className="answer-copy" style={{ fontSize: `${answerFontSize}px` }} onScroll={(event) => { const element = event.currentTarget; followAnswerRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; }} hidden={meetingOpen && responseTab !== 'answers'}>
            {answerHistory.map((item) => <div className="answer-history-entry" key={item.id}><AnswerContent text={item.text} /><hr className="answer-history-divider" /></div>)}
            {answer.status === 'loading' && <span className="thinking-line" aria-hidden="true" />}
            <AnswerContent text={answer.text} />
          </div>

          {meetingOpen && <div className="answer-copy meeting-answer-copy" hidden={responseTab !== 'transcript'}>
            <MeetingPanel
              hasApiKey={hasAnalysisApiKey}
              hasAlibabaApiKey={settings.hasAlibabaApiKey}
              hasAlibabaWorkspaceHost={Boolean(settings.alibabaWorkspaceHost)}
              alibabaWorkspaceHost={settings.alibabaWorkspaceHost}
              transcriptionProvider={settings.transcriptionProvider}
              isAnswerBusy={answer.status === 'loading' || meetingIsAnalyzing}
              isVisible={responseTab === 'transcript'}
              activeProfileId={activeProfileId}
              analysisRequestId={transcriptAnalysisRequestId}
              onSessionActiveChange={onMeetingSessionChange}
              onTranscriptUpdate={onTranscript}
              onAnalysisStateChange={setMeetingIsAnalyzing}
              onSummary={(text, usage) => {
                if (answer.status === 'success' && answer.text.trim()) setAnswerHistory((current) => [...current, { id: crypto.randomUUID(), text: answer.text }]);
                setAnswer({ status: 'success', text });
                setTokenUsage(usage ?? null);
                setAnswerOpen(true);
                setResponseTab('answers');
              }}
            />
          </div>}

          <footer className="answer-footer">
            {answer.status === 'loading' && <button className="copy-action" type="button" hidden={meetingOpen && responseTab !== 'answers'} onClick={() => window.persona.cancelAsk()}><X size={15} /> Cancelar</button>}
            {tokenUsage && <span className="answer-token-usage" hidden={meetingOpen && responseTab !== 'answers'} title="Uso informado pelo provedor; embeddings aparecem separadamente quando documentos são recuperados.">
              {tokenUsage.inputTokens.toLocaleString('pt-BR')} entrada{tokenUsage.cachedInputTokens ? ` (${tokenUsage.cachedInputTokens.toLocaleString('pt-BR')} cache)` : ''} · {tokenUsage.outputTokens.toLocaleString('pt-BR')} saída{tokenUsage.embeddingInputTokens ? ` · ${tokenUsage.embeddingInputTokens.toLocaleString('pt-BR')} embeddings` : ''} tokens
            </span>}
            <button
              className="copy-action"
              type="button"
              hidden={meetingOpen && responseTab !== 'answers'}
              onClick={() => void navigator.clipboard.writeText(answer.text)}
            >
              <Copy size={15} /> <span className="copy-label">Copiar</span>
            </button>
            <button className="copy-action" type="button" hidden={meetingOpen && responseTab !== 'answers'} disabled={isExportingPdf || answer.status === 'loading' || (!answer.text.trim() && answerHistory.length === 0)} title={pdfExportStatus || 'Exportar respostas em PDF'} onClick={() => void exportAnswerPdf()}>
              <FileDown size={15} /> <span>{isExportingPdf ? 'Exportando…' : 'Exportar PDF'}</span>
            </button>
            {pdfExportStatus && <span className={`answer-export-notice ${pdfExportStatus.startsWith('Falha') ? 'is-error' : ''}`} role="status" aria-live="polite">{pdfExportStatus}</span>}
            <div className="answer-typography" aria-label="Tamanho da fonte da resposta" hidden={meetingOpen && responseTab !== 'answers'}>
              <button type="button" aria-label="Diminuir fonte" title="Diminuir fonte" onClick={() => adjustAnswerFont(-1)} disabled={answerFontSize <= 12}><Minus size={15} /><span>A</span></button>
              <output aria-live="polite">{answerFontSize}px</output>
              <button type="button" aria-label="Aumentar fonte" title="Aumentar fonte" onClick={() => adjustAnswerFont(1)} disabled={answerFontSize >= 28}><Plus size={15} /><span>A</span></button>
            </div>
            <label className="opacity-control">
              <span>Opacidade</span>
              <output>{Math.round(settings.opacity * 100)}%</output>
              <input
                type="range"
                min="0.45"
                max="1"
                step="0.01"
                value={settings.opacity}
                onChange={(event) => void changeOpacity(Number(event.target.value))}
                aria-label="Opacidade do overlay"
              />
            </label>
          </footer>
          <button className="answer-resize-handle" type="button" aria-label="Redimensionar painel de resposta" title="Arraste livremente para ajustar largura e altura. Use as setas do teclado para ajustar cada dimensão." onPointerDown={startAnswerResize} onPointerMove={resizeAnswer} onPointerUp={stopAnswerResize} onPointerCancel={stopAnswerResize} onLostPointerCapture={stopAnswerResize} onKeyDown={resizeAnswerByKeyboard}>
            <GripVertical size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      {contextOpen && (
        <ContextPanel profiles={profiles} activeProfileId={activeProfileId} selectedMemory={selectedMemory} onProfilesChange={setProfiles} onActiveProfileChange={setActiveProfileId} onSelectedMemoryChange={setSelectedMemory} onClose={() => setContextOpen(false)} />
      )}

      {dockVisible && (
        <nav className="command-dock glass-surface" style={{ ['--drag-x' as string]: `${dockDrag.offset.x}px`, ['--drag-y' as string]: `${dockDrag.offset.y}px` }} data-interactive aria-label="Ações rápidas" onPointerDown={dockDrag.startDrag}>
          <div className="agent-switcher" ref={agentSwitcherRef} data-interactive>
            <button className="provider-status" type="button" aria-label={`Agente selecionado: ${profiles.find((profile) => profile.id === activeProfileId)?.name ?? 'Copiloto geral'}. Trocar agente`} aria-haspopup="menu" aria-expanded={agentMenuOpen} onClick={() => { setAgentMenuOpen((open) => !open); void window.persona.listProfiles().then(setProfiles); }}>
              <Bot size={16} aria-hidden="true" />
              <span>{profiles.find((profile) => profile.id === activeProfileId)?.name ?? 'Copiloto geral'}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {agentMenuOpen && <div className="agent-quick-menu" data-interactive role="menu" aria-label="Trocar agente">{profiles.map((profile) => <button key={profile.id} type="button" role="menuitemradio" aria-checked={profile.id === activeProfileId} className={profile.id === activeProfileId ? 'is-selected' : ''} onClick={() => { setActiveProfileId(profile.id); localStorage.setItem('persona.activeProfile', profile.id); setAgentMenuOpen(false); }}><span className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</span><span><strong>{profile.name}</strong><small>{profile.builtIn ? 'Agente Persona' : 'Seu especialista'}</small></span>{profile.id === activeProfileId && <Check size={15} />}</button>)}<button type="button" className="agent-menu-settings" onClick={() => { setAgentMenuOpen(false); void window.persona.openSettings(); }}>Gerenciar agentes <SettingsIcon size={14} /></button></div>}
          </div>
          <span className={`dock-drag-handle drag-grip ${interactionMode ? 'is-interactive' : ''}`} title="Arraste para mover a barra"><GripVertical size={19} aria-hidden="true" /></span>
          <button className="dock-action dock-listen" type="button" onClick={openMeeting}>
            <Mic size={19} aria-hidden="true" /> Ouvir
          </button>
          <button className="dock-action dock-primary" type="button" onClick={openPrompt}>
            <MessageSquareText size={19} aria-hidden="true" /> Perguntar
          </button>
          <span className="dock-divider" aria-hidden="true" />
          <button className="icon-button dock-icon" type="button" aria-label="Abrir configurações" onClick={() => void window.persona.openSettings()}>
            <SettingsIcon size={20} aria-hidden="true" />
          </button>
        </nav>
      )}
    </main>
  );
}
