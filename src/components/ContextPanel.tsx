import { Bot, Check, Download, Edit3, FileJson, GripVertical, History, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AssistantProfile, HistoryEntry, MemoryContext, ProfileModelPolicy, SaveAssistantProfileInput } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { useDragPosition } from '../lib/useDragPosition';

type Props = {
  profiles: AssistantProfile[];
  activeProfileId: string;
  selectedMemory: MemoryContext[];
  onProfilesChange(profiles: AssistantProfile[]): void;
  onActiveProfileChange(id: string): void;
  onSelectedMemoryChange(entries: MemoryContext[]): void;
  onClose(): void;
};

const emptyProfile: SaveAssistantProfileInput = { name: '', instructions: '', modelPolicy: 'default' };
const policyLabels: Record<ProfileModelPolicy, string> = { default: 'Padrão global', economy: 'Economia', balanced: 'Equilíbrio', quality: 'Qualidade' };

export function ContextPanel(props: Props) {
  const [tab, setTab] = useState<'profiles' | 'memory'>('profiles');
  const [draft, setDraft] = useState<SaveAssistantProfileInput>(emptyProfile);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [memory, setMemory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const panelDrag = useDragPosition({ x: 0, y: 0 });

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void window.persona.searchMemory(query).then(setMemory).catch((error) => setNotice(errorMessage(error))), 180);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); props.onClose(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [props.onClose]);

  const selectedIds = useMemo(() => new Set(props.selectedMemory.map((entry) => entry.id)), [props.selectedMemory]);

  const refreshProfiles = async () => props.onProfilesChange(await window.persona.listProfiles());
  const submitProfile = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const saved = await window.persona.saveProfile(draft);
      await refreshProfiles();
      props.onActiveProfileChange(saved.id);
      setDraft(emptyProfile); setEditing(false); setNotice('Assistente salvo.');
    } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); }
  };

  const startEdit = (profile: AssistantProfile) => {
    setDraft({ id: profile.id, name: profile.name, instructions: profile.instructions, modelPolicy: profile.modelPolicy });
    setEditing(true);
  };

  const removeProfile = async (profile: AssistantProfile) => {
    if (!window.confirm(`Excluir o assistente “${profile.name}”?`)) return;
    setBusy(true); setNotice('');
    try {
      await window.persona.deleteProfile(profile.id);
      if (props.activeProfileId === profile.id) props.onActiveProfileChange('general');
      await refreshProfiles();
    } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); }
  };

  const toggleMemory = (entry: HistoryEntry) => {
    if (selectedIds.has(entry.id)) props.onSelectedMemoryChange(props.selectedMemory.filter((item) => item.id !== entry.id));
    else if (props.selectedMemory.length < 8) props.onSelectedMemoryChange([...props.selectedMemory, { id: entry.id, prompt: entry.prompt, answer: entry.answer, createdAt: entry.createdAt }]);
    else setNotice('Selecione no máximo 8 memórias por pergunta.');
  };

  const removeMemory = async (id: string) => {
    if (!window.confirm('Excluir esta memória local permanentemente?')) return;
    try {
      await window.persona.deleteMemory(id);
      props.onSelectedMemoryChange(props.selectedMemory.filter((item) => item.id !== id));
      setMemory((items) => items.filter((item) => item.id !== id));
    } catch (error) { setNotice(errorMessage(error)); }
  };

  const exportMemory = async (format: 'json' | 'markdown') => {
    try { if (await window.persona.exportMemory(format)) setNotice('Memória exportada.'); }
    catch (error) { setNotice(`Não foi possível exportar: ${errorMessage(error)}`); }
  };

  const clearAllMemory = async () => {
    if (!window.confirm('Apagar toda a memória local? Esta ação não pode ser desfeita.')) return;
    try { await window.persona.clearHistory(); setMemory([]); props.onSelectedMemoryChange([]); setNotice('Memória local apagada.'); }
    catch (error) { setNotice(errorMessage(error)); }
  };

  return (
    <div className="context-backdrop" data-interactive>
      <section ref={panelRef} className="context-panel glass-surface" style={{ ['--drag-x' as string]: `${panelDrag.offset.x}px`, ['--drag-y' as string]: `${panelDrag.offset.y}px` }} role="dialog" aria-modal="true" aria-labelledby="context-title">
        <header className="context-header">
          <div className="context-heading-copy">
            <h2 id="context-title" className="drag-grip" tabIndex={0} onMouseDown={panelDrag.startDrag} onKeyDown={(event) => {
              const distance = event.shiftKey ? 30 : 10;
              if (event.key === 'ArrowLeft') panelDrag.moveBy(-distance, 0);
              else if (event.key === 'ArrowRight') panelDrag.moveBy(distance, 0);
              else if (event.key === 'ArrowUp') panelDrag.moveBy(0, -distance);
              else if (event.key === 'ArrowDown') panelDrag.moveBy(0, distance);
              else return;
              event.preventDefault();
            }} title="Arraste para mover a janela. Use as setas para mover pelo teclado."><GripVertical size={15} aria-hidden="true" /> Assistente e contexto</h2>
            <p>Escolha como a Persona responde e quais memórias pode consultar.</p>
          </div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Fechar contexto" onClick={props.onClose}><X size={18} /></button>
        </header>
        <div className="context-tabs" role="tablist">
          <button className={tab === 'profiles' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'profiles'} onClick={() => setTab('profiles')}><Bot size={16} /> Assistentes</button>
          <button className={tab === 'memory' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'memory'} onClick={() => setTab('memory')}><History size={16} /> Memória <span>{props.selectedMemory.length}</span></button>
        </div>

        {tab === 'profiles' ? (
          <div className="profiles-workspace">
            <div className="profile-list" aria-label="Perfis de assistente">
              {props.profiles.map((profile) => (
                <div key={profile.id} className={`profile-row ${props.activeProfileId === profile.id ? 'is-active' : ''}`}>
                  <button type="button" aria-pressed={props.activeProfileId === profile.id} onClick={() => props.onActiveProfileChange(profile.id)}><span className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</span><span><strong>{profile.name}</strong><small>{policyLabels[profile.modelPolicy]} · {profile.builtIn ? 'Padrão' : 'Personalizado'}</small></span>{props.activeProfileId === profile.id && <Check size={16} />}</button>
                  {!profile.builtIn && <span className="profile-tools"><button type="button" aria-label={`Editar ${profile.name}`} onClick={() => startEdit(profile)}><Edit3 size={14} /></button><button type="button" aria-label={`Excluir ${profile.name}`} onClick={() => void removeProfile(profile)}><Trash2 size={14} /></button></span>}
                </div>
              ))}
              <button className="new-profile" type="button" onClick={() => { setDraft(emptyProfile); setEditing(true); }}><Plus size={15} /> Novo assistente</button>
            </div>
            <div className="profile-detail">
              {editing ? (
                <form onSubmit={(event) => void submitProfile(event)}>
                  <div className="profile-form-heading"><h3>{draft.id ? 'Editar assistente' : 'Novo assistente'}</h3><button className="icon-button" type="button" aria-label="Cancelar edição" onClick={() => setEditing(false)}><X size={16} /></button></div>
                  <label>Nome<input value={draft.name} maxLength={60} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Ex.: Revisor técnico" required /></label>
                  <label>Instruções<textarea value={draft.instructions} maxLength={4000} onChange={(event) => setDraft((value) => ({ ...value, instructions: event.target.value }))} placeholder="Como este assistente deve analisar e responder?" required /></label>
                  <label>Política de modelo<select value={draft.modelPolicy} onChange={(event) => setDraft((value) => ({ ...value, modelPolicy: event.target.value as ProfileModelPolicy }))}>{Object.entries(policyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <button className="meeting-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar assistente'}</button>
                </form>
              ) : (
                <div className="profile-preview"><Bot size={28} /><h3>{props.profiles.find((item) => item.id === props.activeProfileId)?.name}</h3><p>{props.profiles.find((item) => item.id === props.activeProfileId)?.instructions}</p><small>Este perfil será usado nas próximas perguntas.</small></div>
              )}
            </div>
          </div>
        ) : (
          <div className="memory-workspace">
            <div className="memory-toolbar">
              <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar perguntas e respostas…" aria-label="Buscar na memória" /></label>
              <button type="button" onClick={() => void exportMemory('markdown')}><Download size={15} /> Markdown</button>
              <button type="button" aria-label="Exportar memória em JSON" onClick={() => void exportMemory('json')}><FileJson size={15} /></button>
              <button type="button" aria-label="Apagar toda a memória" onClick={() => void clearAllMemory()}><Trash2 size={15} /></button>
            </div>
            <div className="memory-list">
              {memory.map((entry) => <article key={entry.id} className={selectedIds.has(entry.id) ? 'is-selected' : ''}><button className="memory-select" type="button" aria-pressed={selectedIds.has(entry.id)} aria-label={`${selectedIds.has(entry.id) ? 'Remover' : 'Adicionar'} “${entry.prompt || 'Consulta com captura'}” do contexto`} onClick={() => toggleMemory(entry)}><span>{selectedIds.has(entry.id) ? <Check size={15} /> : <Plus size={15} />}</span><div><time>{new Date(entry.createdAt).toLocaleDateString('pt-BR')}</time><h3>{entry.prompt || 'Consulta com captura'}</h3><p>{entry.answer}</p></div></button><button className="memory-delete" type="button" aria-label="Excluir memória" onClick={() => void removeMemory(entry.id)}><Trash2 size={14} /></button></article>)}
              {!memory.length && <div className="memory-empty"><History size={28} /><strong>{query.trim() ? 'Nenhum resultado para esta busca' : 'Nenhuma memória salva'}</strong><span>{query.trim() ? 'Tente buscar por outros termos.' : 'Ative a memória local nas configurações para guardar novas conversas.'}</span></div>}
            </div>
          </div>
        )}
        {notice && <p className="context-notice" role="status">{notice}</p>}
      </section>
    </div>
  );
}
