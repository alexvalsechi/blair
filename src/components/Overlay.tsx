import {
  ArrowUp,
  Bot,
  Camera,
  Check,
  ChevronDown,
  Copy,
  EyeOff,
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
import type { AssistantProfile, Attachment, MemoryContext, ShortcutAction, StreamEvent } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { KeyHint } from './KeyHint';
import { MeetingPanel } from './MeetingPanel';
import { ContextPanel } from './ContextPanel';
import { AnswerContent } from './AnswerContent';
import { useDragPosition } from '../lib/useDragPosition';

type AnswerState =
  | { status: 'idle'; text: string }
  | { status: 'loading'; text: string }
  | { status: 'success'; text: string; requestId?: string }
  | { status: 'error'; text: string };

const initialAnswer: AnswerState = {
  status: 'idle',
  text: 'Persona está pronta. Faça uma pergunta ou capture a tela para receber uma resposta aqui.',
};

export function Overlay() {
  const [settings, setSettings] = useState({ opacity: 0.86, hasApiKey: false, model: 'gpt-5.5', scale: 1, layoutPosition: 'center' });
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [answerOpen, setAnswerOpen] = useState(true);
  const [answerFontSize, setAnswerFontSize] = useState(16);
  const [answerSize, setAnswerSize] = useState<{ width: number; height: number; left: number; top: number; dragOriginX: number; dragOriginY: number } | null>(null);
  const answerPanelRef = useRef<HTMLElement>(null);
  const answerResizeRef = useRef<{ pointerId: number; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const [dockVisible, setDockVisible] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [interactionMode, setInteractionMode] = useState(false);
  const [answer, setAnswer] = useState<AnswerState>(initialAnswer);
  const [isCapturing, setIsCapturing] = useState(false);
  const captureInFlight = useRef(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const agentSwitcherRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<AssistantProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem('persona.activeProfile') ?? 'general');
  const [selectedMemory, setSelectedMemory] = useState<MemoryContext[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptDrag = useDragPosition({ x: 0, y: 0 });
  const answerDrag = useDragPosition({ x: 0, y: 0 });
  const dockDrag = useDragPosition({ x: 0, y: 0 });

  useEffect(() => {
    const publishInteractiveRegions = () => {
      const regions = Array.from(document.querySelectorAll<HTMLElement>('[data-interactive]')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      window.persona.setInteractiveRegions(regions);
    };
    publishInteractiveRegions();
    const observer = new ResizeObserver(publishInteractiveRegions);
    observer.observe(document.documentElement);
    document.querySelectorAll<HTMLElement>('[data-interactive]').forEach((element) => observer.observe(element));
    window.addEventListener('resize', publishInteractiveRegions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publishInteractiveRegions);
      window.persona.setInteractiveRegions([]);
    };
  }, [promptOpen, answerOpen, dockVisible, meetingOpen, contextOpen, agentMenuOpen, attachments.length, selectedMemory.length, promptDrag.offset.x, promptDrag.offset.y, answerDrag.offset.x, answerDrag.offset.y, dockDrag.offset.x, dockDrag.offset.y]);

  useEffect(() => {
    void window.persona.getSettings().then((value) => {
      setSettings({ opacity: value.opacity, hasApiKey: value.hasApiKey, model: value.model, scale: value.scale, layoutPosition: value.layoutPosition });
    });
  }, []);

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

  useEffect(() => window.persona.onStream((event: StreamEvent) => {
    if (event.type === 'delta') setAnswer((current) => ({ status: 'loading', text: current.text + event.text }));
    if (event.type === 'done') setAnswer((current) => ({ status: 'success', text: current.text, requestId: event.requestId }));
    if (event.type === 'cancelled') setAnswer((current) => ({ status: 'success', text: current.text || 'Solicitação cancelada.' }));
    if (event.type === 'error') setAnswer({ status: 'error', text: event.message });
  }), []);

  const openPrompt = useCallback(() => {
    setPromptOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const submit = useCallback(
    async (imageDataUrl?: string) => {
      if (answer.status === 'loading' || (captureInFlight.current && !imageDataUrl)) return;
      if (!settings.hasApiKey) {
        setAnswerOpen(true);
        setAnswer({ status: 'error', text: 'Configure sua chave OpenAI para começar.' });
        await window.persona.openSettings();
        return;
      }
      if (!prompt.trim() && !imageDataUrl && !attachments.length) {
        openPrompt();
        return;
      }

      setAnswerOpen(true);
      setAnswer({ status: 'loading', text: imageDataUrl ? 'Analisando a captura…' : 'Pensando na sua pergunta…' });
      try {
        window.persona.askStream({ prompt: prompt.trim(), imageDataUrl, profileId: activeProfileId, attachments, contextEntries: selectedMemory });
        setAnswer({ status: 'loading', text: '' });
        setPrompt('');
        setAttachments([]);
        setSelectedMemory([]);
        setPromptOpen(false);
      } catch (error) {
        setAnswer({ status: 'error', text: errorMessage(error) });
      }
    },
    [activeProfileId, answer.status, attachments, openPrompt, prompt, selectedMemory, settings.hasApiKey],
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
    if (captureInFlight.current || answer.status === 'loading') return;
    if (!settings.hasApiKey) {
      setAnswerOpen(true);
      setAnswer({ status: 'error', text: 'Configure sua chave OpenAI para começar.' });
      await window.persona.openSettings();
      return;
    }
    captureInFlight.current = true;
    setIsCapturing(true);
    try {
      const source = await window.persona.captureOverlayScreen();
      if (!source) throw new Error('Não foi possível capturar a tela onde a barra do Persona está posicionada.');
      await submit(source.dataUrl);
    } catch (error) {
      setAnswerOpen(true);
      setAnswer({ status: 'error', text: errorMessage(error) });
    } finally {
      captureInFlight.current = false;
      setIsCapturing(false);
    }
  }, [answer.status, settings.hasApiKey, submit]);

  useEffect(() => {
    return window.persona.onShortcut((action: ShortcutAction) => {
      if (action === 'ask') {
        if (promptOpen && prompt.trim()) void submit();
        else openPrompt();
      }
      if (action === 'capture') void openCapture();
      if (action === 'meeting') setMeetingOpen(true);
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
  }, [openCapture, openPrompt, prompt, promptOpen, submit]);

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
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <span className="drag-grip" onMouseDown={promptDrag.startDrag} title="Arraste para mover a pergunta"><Sparkles size={20} className="accent-icon" aria-hidden="true" /></span>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Pergunte sem sair da reunião…"
            aria-label="Pergunta para a IA"
          />
          <KeyHint keys={['Ctrl', 'Enter']} />
          <button className="send-button" type="submit" disabled={(!prompt.trim() && !attachments.length) || answer.status === 'loading'} aria-label="Enviar pergunta">
            <ArrowUp size={20} />
          </button>
          <div className="prompt-context-row">
            <button type="button" onClick={() => setContextOpen(true)}><Layers3 size={14} /> {profiles.find((item) => item.id === activeProfileId)?.name ?? 'Copiloto geral'}{selectedMemory.length > 0 && <span>{selectedMemory.length} memória{selectedMemory.length > 1 ? 's' : ''}</span>}</button>
            <button type="button" onClick={() => void addAttachments()}><Paperclip size={14} /> Anexar</button>
            {attachments.map((attachment) => <span className="attachment-chip" key={attachment.id}>{attachment.name}<button type="button" aria-label={`Remover ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}><X size={12} /></button></span>)}
          </div>
        </form>
      )}

      {answerOpen && (
        <section ref={answerPanelRef} className={`answer-panel glass-surface answer-${answer.status}`} style={{ ['--drag-x' as string]: `${answerDrag.offset.x}px`, ['--drag-y' as string]: `${answerDrag.offset.y}px`, ...(answerSize ? { width: `${answerSize.width}px`, height: `${answerSize.height}px`, left: `${answerSize.left}px`, top: `${answerSize.top}px`, transform: `translate(${answerDrag.offset.x - answerSize.dragOriginX}px, ${answerDrag.offset.y - answerSize.dragOriginY}px) scale(var(--overlay-scale, 1))`, transformOrigin: 'top left', paddingInline: `${Math.max(6, Math.min(26, (answerSize.width - 120) / 2))}px` } : {}) }} data-interactive aria-live="polite">
          <header className="answer-header">
            <span className="answer-title drag-grip" aria-label="Resposta" onMouseDown={answerDrag.startDrag} title="Arraste para mover a resposta"><MessageSquareText size={19} /><span>Resposta</span></span>
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
              <button className="icon-button" type="button" aria-label="Recolher resposta" onClick={() => setAnswerOpen(false)}>
                <X size={18} />
              </button>
            </span>
          </header>

          <div className="answer-copy" style={{ fontSize: `${answerFontSize}px` }}>
            {answer.status === 'loading' && <span className="thinking-line" aria-hidden="true" />}
            <AnswerContent text={answer.text} />
          </div>

          <footer className="answer-footer">
            {answer.status === 'loading' && <button className="copy-action" type="button" onClick={() => window.persona.cancelAsk()}><X size={15} /> Cancelar</button>}
            <button
              className="copy-action"
              type="button"
              onClick={() => void navigator.clipboard.writeText(answer.text)}
            >
              <Copy size={15} /> <span className="copy-label">Copiar</span>
            </button>
            <div className="answer-typography" aria-label="Tamanho da fonte da resposta">
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

      {meetingOpen && (
        <MeetingPanel
          hasApiKey={settings.hasApiKey}
          onClose={() => setMeetingOpen(false)}
          onSummary={(text, keepPanelOpen) => {
            setAnswer({ status: 'success', text });
            setAnswerOpen(true);
            if (!keepPanelOpen) setMeetingOpen(false);
          }}
        />
      )}

      {contextOpen && (
        <ContextPanel profiles={profiles} activeProfileId={activeProfileId} selectedMemory={selectedMemory} onProfilesChange={setProfiles} onActiveProfileChange={setActiveProfileId} onSelectedMemoryChange={setSelectedMemory} onClose={() => setContextOpen(false)} />
      )}

      {dockVisible && (
        <nav className="command-dock glass-surface" style={{ ['--drag-x' as string]: `${dockDrag.offset.x}px`, ['--drag-y' as string]: `${dockDrag.offset.y}px` }} data-interactive aria-label="Ações rápidas">
          <span className={`dock-drag-handle drag-grip ${interactionMode ? 'is-interactive' : ''}`} onMouseDown={dockDrag.startDrag} title="Arraste para mover a barra (Ctrl+Shift+I ativa edição)"><GripVertical size={16} /></span>
          <button className="dock-action dock-primary" type="button" onClick={openPrompt}>
            <MessageSquareText size={19} /> Perguntar
          </button>
          <button className="dock-action" type="button" onClick={() => void openCapture()} disabled={isCapturing || answer.status === 'loading'}>
            <Camera size={19} /> {isCapturing ? 'Capturando…' : 'Capturar'}
          </button>
          <button className="dock-action dock-primary" type="button" onClick={() => setMeetingOpen(true)}>
            <Mic size={18} /> Começar a ouvir <kbd>Ctrl+D</kbd>
          </button>
          <span className="dock-divider" aria-hidden="true" />
          <div className="agent-switcher" ref={agentSwitcherRef}>
            <button className="provider-status" type="button" aria-haspopup="menu" aria-expanded={agentMenuOpen} onClick={() => { setAgentMenuOpen((open) => !open); void window.persona.listProfiles().then(setProfiles); }}>
              <Bot size={15} />
              {profiles.find((profile) => profile.id === activeProfileId)?.name ?? 'Copiloto geral'}
              <ChevronDown size={14} />
            </button>
            {agentMenuOpen && <div className="agent-quick-menu" data-interactive role="menu" aria-label="Trocar agente">{profiles.map((profile) => <button key={profile.id} type="button" role="menuitemradio" aria-checked={profile.id === activeProfileId} className={profile.id === activeProfileId ? 'is-selected' : ''} onClick={() => { setActiveProfileId(profile.id); localStorage.setItem('persona.activeProfile', profile.id); setAgentMenuOpen(false); }}><span className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</span><span><strong>{profile.name}</strong><small>{profile.builtIn ? 'Agente Persona' : 'Seu especialista'}</small></span>{profile.id === activeProfileId && <Check size={15} />}</button>)}<button type="button" className="agent-menu-settings" onClick={() => { setAgentMenuOpen(false); void window.persona.openSettings(); }}>Gerenciar agentes <SettingsIcon size={14} /></button></div>}
          </div>
          <button className="icon-button dock-icon" type="button" aria-label="Abrir configurações" onClick={() => void window.persona.openSettings()}>
            <SettingsIcon size={18} />
          </button>
          <button className="icon-button dock-icon" type="button" aria-label="Ocultar barra (Ctrl+M para mostrar)" title="Ocultar barra — Ctrl+M para mostrar" onClick={() => setDockVisible(false)}>
            <EyeOff size={18} />
          </button>
        </nav>
      )}
    </main>
  );
}
