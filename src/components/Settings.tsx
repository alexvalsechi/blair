import { Activity, Bot, Check, ChevronRight, Eye, EyeOff, Keyboard, LockKeyhole, MessageSquareText, Mic, Monitor, Paperclip, Plus, Save, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react';
import type { AssistantProfile, Attachment, ModelPolicy, ProfileModelPolicy, SaveAssistantProfileInput } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { analysisModelPrice, transcriptionModelPrice } from '../lib/model-pricing';

type Page = 'connection' | 'models' | 'agents' | 'privacy' | 'appearance' | 'shortcuts';
type Notice = { tone: 'success' | 'error'; text: string } | null;
type ModelTask = 'analysis' | 'transcription';

const nav: { id: Page; label: string; icon: typeof Settings2 }[] = [
  { id: 'connection', label: 'Conexão', icon: Activity },
  { id: 'models', label: 'Modelos', icon: Sparkles },
  { id: 'agents', label: 'Agentes especialistas', icon: Bot },
  { id: 'privacy', label: 'Privacidade', icon: ShieldCheck },
  { id: 'appearance', label: 'Aparência', icon: Monitor },
  { id: 'shortcuts', label: 'Atalhos', icon: Keyboard },
];

const emptyAgent: SaveAssistantProfileInput = { name: '', instructions: '', modelPolicy: 'default' };
const policyLabels: Record<ProfileModelPolicy, string> = { default: 'Padrão global', economy: 'Economia', balanced: 'Equilíbrio', quality: 'Qualidade' };
const policyDescriptions: Record<ModelPolicy, string> = {
  economy: 'Para tarefas rápidas, sínteses curtas e alto volume.',
  balanced: 'O padrão para perguntas, análise de tela e reuniões.',
  quality: 'Para raciocínio mais exigente e respostas detalhadas.',
};

function moveTabFocus(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
  const current = tabs.indexOf(event.currentTarget);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

export function Settings() {
  const [page, setPage] = useState<Page>('connection');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [modelPolicy, setModelPolicy] = useState<ModelPolicy>('balanced');
  const [viewPolicy, setViewPolicy] = useState<ModelPolicy>('balanced');
  const [policyModels, setPolicyModels] = useState<Record<ModelPolicy, string>>({ economy: 'gpt-5.5', balanced: 'gpt-5.5', quality: 'gpt-5.5' });
  const [transcriptionModel, setTranscriptionModel] = useState('gpt-4o-mini-transcribe');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [transcriptionOptions, setTranscriptionOptions] = useState<string[]>([]);
  const [modelTask, setModelTask] = useState<ModelTask>('analysis');
  const [contentProtection, setContentProtection] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [scale, setScale] = useState(1);
  const [layoutPosition, setLayoutPosition] = useState<'center' | 'upper-right' | 'lower-center'>('center');
  const [maxOutputTokens, setMaxOutputTokens] = useState(1200);
  const [profiles, setProfiles] = useState<AssistantProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem('persona.activeProfile') ?? 'general');
  const [draft, setDraft] = useState<SaveAssistantProfileInput>(emptyAgent);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [diagnostic, setDiagnostic] = useState('');

  useEffect(() => {
    void window.persona.getSettings().then((settings) => {
      setHasApiKey(settings.hasApiKey); setContentProtection(settings.contentProtection);
      setHistoryEnabled(settings.historyEnabled); setModelPolicy(settings.modelPolicy); setPolicyModels(settings.policyModels); setTranscriptionModel(settings.transcriptionModel);
      setMaxOutputTokens(settings.maxOutputTokens); setScale(settings.scale); setLayoutPosition(settings.layoutPosition);
    });
    void window.persona.listProfiles().then(setProfiles);
  }, []);

  const selectedProfile = useMemo(() => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0], [activeProfileId, profiles]);

  const saveSettings = async (event?: FormEvent) => {
    event?.preventDefault(); setBusy(true); setNotice(null);
    try {
      const saved = await window.persona.saveSettings({ apiKey: apiKey.trim() || undefined, model: policyModels.balanced, transcriptionModel, contentProtection, historyEnabled, modelPolicy, policyModels, maxOutputTokens, scale, layoutPosition });
      setHasApiKey(saved.hasApiKey); setApiKey('');
      setNotice({ tone: 'success', text: 'Configurações salvas com segurança.' });
    } catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  const loadModels = async () => {
    if (!hasApiKey) { setPage('connection'); setNotice({ tone: 'error', text: 'Conecte sua chave OpenAI para carregar os modelos da conta.' }); return; }
    setLoadingModels(true); setNotice(null);
    try {
      if (modelTask === 'transcription') setTranscriptionOptions(await window.persona.listTranscriptionModels());
      else setModelOptions(await window.persona.listModels());
    }
    catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setLoadingModels(false); }
  };

  const testConnection = async () => {
    setTesting(true); setNotice(null);
    try { const result = await window.persona.testConnection(); setNotice({ tone: 'success', text: result.text }); }
    catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setTesting(false); }
  };

  const saveAgent = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const saved = await window.persona.saveProfile(draft);
      const next = await window.persona.listProfiles(); setProfiles(next); setDraft(emptyAgent); setEditing(false);
      localStorage.setItem('persona.profilesUpdatedAt', String(Date.now()));
      setActiveProfileId(saved.id); localStorage.setItem('persona.activeProfile', saved.id);
      setNotice({ tone: 'success', text: `Agente “${saved.name}” salvo e selecionado na barra.` });
    } catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  const addAgentDocuments = async () => {
    try {
      const selected = await window.persona.selectAssistantDocuments();
      if (!selected.length) return;
      setDraft((current) => {
        const existing = current.knowledgeFiles ?? [];
        const additions = selected.filter((file) => !existing.some((item) => item.name === file.name));
        if (existing.length + additions.length > 5) {
          setNotice({ tone: 'error', text: 'Cada agente pode ter até 5 documentos.' });
          return current;
        }
        return { ...current, knowledgeFiles: [...existing, ...additions] };
      });
      setNotice(null);
    } catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
  };

  const removeAgentDocument = (document: Attachment) => setDraft((current) => ({
    ...current,
    knowledgeFiles: (current.knowledgeFiles ?? []).filter((file) => file.id !== document.id),
  }));

  const deleteAgent = async (profile: AssistantProfile) => {
    if (profile.builtIn || !window.confirm(`Excluir o agente “${profile.name}”?`)) return;
    setBusy(true); setNotice(null);
    try {
      await window.persona.deleteProfile(profile.id);
      const next = await window.persona.listProfiles(); setProfiles(next);
      localStorage.setItem('persona.profilesUpdatedAt', String(Date.now()));
      if (profile.id === activeProfileId) { const fallback = next[0]?.id ?? 'general'; setActiveProfileId(fallback); localStorage.setItem('persona.activeProfile', fallback); }
      setNotice({ tone: 'success', text: 'Agente removido.' });
    } catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  const choosePolicy = (policy: ModelPolicy) => { setModelPolicy(policy); };

  return (
    <main className="settings-app">
      <header className="settings-topbar">
        <button className="settings-back" type="button" aria-label="Voltar ao Persona" onClick={() => void window.persona.closeSettings()}><ChevronRight size={18} /></button>
        <span className="settings-brand"><Sparkles size={18} /> Persona <span className="settings-brand-section">/ Configurações</span></span>
        <div className="settings-top-actions">
          {notice && <span className={`settings-inline-notice ${notice.tone}`} role="status">{notice.text}</span>}
          <button className="settings-save" type="button" onClick={() => void saveSettings()} disabled={busy}><Save size={15} />{busy ? 'Salvando…' : 'Salvar alterações'}</button>
          <button className="settings-close" type="button" aria-label="Fechar configurações" onClick={() => void window.persona.closeSettings()}><X size={18} /></button>
        </div>
      </header>

      <div className="settings-workspace">
        <aside className="settings-sidebar" aria-label="Seções de configuração">
          <p>PERSONA DESKTOP</p>
          <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={page === id ? 'is-active' : ''} onClick={() => { setPage(id); setNotice(null); }}><Icon size={17} />{label}{page === id && <ChevronRight size={14} />}</button>)}</nav>
          <div className="sidebar-connection"><span className={`status-dot ${hasApiKey ? 'is-ready' : ''}`} /><span><strong>{hasApiKey ? 'OpenAI conectada' : 'Conexão pendente'}</strong><small>{hasApiKey ? 'Chave protegida no Windows' : 'Adicione uma chave para começar'}</small></span></div>
        </aside>

        <section className="settings-content" aria-live="polite">
          {page === 'connection' && <>
            <div className="settings-page-heading"><div><h1>Conexão</h1><p>Gerencie a chave usada pela Persona para respostas e transcrição.</p></div><span className={`connection-chip ${hasApiKey ? 'connected' : ''}`}><span />{hasApiKey ? 'Configurada' : 'Pendente'}</span></div>
            <section className="settings-section"><h2>OpenAI API</h2><p className="settings-section-copy">A chave fica protegida pelo Windows e não é enviada aos componentes da interface.</p><label className="settings-label" htmlFor="api-key">Chave da API</label><div className="secret-field"><input id="api-key" type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? 'Chave protegida — digite apenas para substituir' : 'sk-…'} autoComplete="off" spellCheck={false} /><button type="button" aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'} onClick={() => setShowKey((value) => !value)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><p className="field-help">A chave existente nunca é exibida. Deixe em branco para manter a conexão atual.</p><div className="settings-button-row"><button className="settings-secondary" type="button" disabled={!hasApiKey || testing} onClick={() => void testConnection()}>{testing ? 'Testando…' : 'Testar conexão'}</button><button className="settings-secondary" type="button" onClick={() => void window.persona.diagnostics().then((value) => setDiagnostic(value.message))}>Diagnóstico</button></div>{diagnostic && <p className="settings-info" role="status">{diagnostic}</p>}</section>
            <section className="settings-section provider-row"><div className="provider-glyph">◎</div><div><strong>OpenAI</strong><p>Provedor ativo para análise, respostas e transcrição.</p></div><span className="provider-tag">API Key</span></section>
          </>}

          {page === 'models' && <>
            <div className="settings-page-heading"><div><h1>Modelos</h1><p>Escolha os modelos para análise e transcrição com sua conta OpenAI.</p></div><button className="settings-secondary" type="button" onClick={() => void loadModels()} disabled={loadingModels}>{loadingModels ? 'Buscando…' : 'Atualizar modelos'}</button></div>
            <div className="model-task-tabs" role="tablist" aria-label="Tarefa"><button id="analysis-task-tab" type="button" role="tab" aria-controls="analysis-task-panel" aria-selected={modelTask === 'analysis'} tabIndex={modelTask === 'analysis' ? 0 : -1} className={modelTask === 'analysis' ? 'is-active' : ''} onKeyDown={moveTabFocus} onClick={() => setModelTask('analysis')}>Análise e chat</button><button id="transcription-task-tab" type="button" role="tab" aria-controls="transcription-task-panel" aria-selected={modelTask === 'transcription'} tabIndex={modelTask === 'transcription' ? 0 : -1} className={modelTask === 'transcription' ? 'is-active' : ''} onKeyDown={moveTabFocus} onClick={() => setModelTask('transcription')}>Transcrição</button><button type="button" disabled title="Tradução ainda não está disponível nesta versão">Tradução</button></div>
            {modelTask === 'analysis' ? <>
            <div id="analysis-task-panel" role="tabpanel" aria-labelledby="analysis-task-tab" tabIndex={0}>
            <div className="model-policy-tabs" role="tablist" aria-label="Faixa de modelo">{(['economy', 'balanced', 'quality'] as const).map((policy) => <button id={`policy-${policy}-tab`} type="button" key={policy} role="tab" aria-controls="analysis-policy-panel" aria-selected={viewPolicy === policy} tabIndex={viewPolicy === policy ? 0 : -1} className={viewPolicy === policy ? 'is-active' : ''} onKeyDown={moveTabFocus} onClick={() => setViewPolicy(policy)}>{policyLabels[policy]}</button>)}</div>
            <div id="analysis-policy-panel" role="tabpanel" aria-labelledby={`policy-${viewPolicy}-tab`} tabIndex={0}>
            <p className="settings-section-copy">{policyDescriptions[viewPolicy]} Estimativas em USD, tabela consultada em 14/10/2026, faixa Standard e contexto curto. Ferramentas e modalidades podem ter cobrança adicional.</p>
            <section className="model-catalog" aria-label="Modelos disponíveis">
              {modelOptions.length ? modelOptions.map((modelId) => <button type="button" key={modelId} className={`model-card ${policyModels[viewPolicy] === modelId ? 'is-selected' : ''}`} onClick={() => setPolicyModels((current) => ({ ...current, [viewPolicy]: modelId }))}><span className="model-icon">◎</span><span className="model-copy"><strong>{modelId}</strong><small>{modelId === policyModels[viewPolicy] ? `Selecionado para ${policyLabels[viewPolicy].toLowerCase()}` : `Modelo OpenAI · ${policyLabels[viewPolicy].toLowerCase()}`}</small><small className="model-price">{analysisModelPrice(modelId)}</small></span>{policyModels[viewPolicy] === modelId && <Check size={17} />}</button>) : <div className="model-empty"><Sparkles size={22} /><strong>{hasApiKey ? 'Carregue os modelos da sua conta' : 'Conecte a OpenAI para ver seus modelos'}</strong><span>{hasApiKey ? 'A lista reflete os modelos acessíveis por esta chave.' : 'Você pode cadastrar a chave na seção Conexão.'}</span>{hasApiKey && <button className="settings-secondary" type="button" onClick={() => void loadModels()} disabled={loadingModels}>{loadingModels ? 'Carregando…' : 'Carregar modelos'}</button>}</div>}
            </section>
            </div>
            <section className="settings-section model-advanced"><h2>Comportamento da resposta</h2><label className="settings-label" htmlFor="max-output">Limite de resposta <output>{maxOutputTokens.toLocaleString('pt-BR')} tokens</output></label><input id="max-output" type="range" min="200" max="8000" step="200" value={maxOutputTokens} onChange={(event) => setMaxOutputTokens(Number(event.target.value))} /><p className="field-help">Limite técnico da resposta; não representa um teto de custo garantido.</p><label className="settings-label" htmlFor="default-policy">Faixa padrão<select id="default-policy" className="settings-select" value={modelPolicy} onChange={(event) => choosePolicy(event.target.value as ModelPolicy)}><option value="economy">Economia</option><option value="balanced">Equilíbrio</option><option value="quality">Qualidade</option></select></label><p className="field-help">Agentes especialistas podem usar uma faixa diferente da padrão.</p></section>
            </div>
            </> : <>
              <div id="transcription-task-panel" role="tabpanel" aria-labelledby="transcription-task-tab" tabIndex={0}>
              <p className="settings-section-copy">O modelo selecionado será usado para transcrever os trechos de áudio das reuniões. Valores estimados em USD pela tabela consultada em 14/10/2026; podem mudar. Custo por minuto de áudio ou tokens.</p>
              <section className="model-catalog" aria-label="Modelos de transcrição">
                {transcriptionOptions.length ? transcriptionOptions.map((modelId) => <button type="button" key={modelId} className={`model-card ${transcriptionModel === modelId ? 'is-selected' : ''}`} onClick={() => setTranscriptionModel(modelId)}><span className="model-icon"><Mic size={18} /></span><span className="model-copy"><strong>{modelId}</strong><small>{transcriptionModel === modelId ? 'Selecionado para transcrição' : 'Modelo de áudio OpenAI'}</small><small className="model-price">{transcriptionModelPrice(modelId)}</small></span>{transcriptionModel === modelId && <Check size={17} />}</button>) : <div className="model-empty"><Mic size={22} /><strong>{hasApiKey ? `Modelo atual: ${transcriptionModel}` : 'Conecte a OpenAI para listar modelos de áudio'}</strong><span>Busque os modelos disponíveis na sua conta para escolher outro.</span>{hasApiKey && <button className="settings-secondary" type="button" onClick={() => void loadModels()} disabled={loadingModels}>{loadingModels ? 'Carregando…' : 'Carregar modelos de áudio'}</button>}</div>}
              </section>
              </div>
            </>}
          </>}

          {page === 'agents' && <>
            <div className="settings-page-heading"><div><h1>Agentes especialistas</h1><p>Crie perfis para tarefas recorrentes e troque entre eles na barra do Persona.</p></div><button className="settings-primary" type="button" onClick={() => { setDraft(emptyAgent); setEditing(true); }}><Plus size={16} />Novo agente</button></div>
            <div className="agent-layout"><div className="agent-list" aria-label="Agentes disponíveis">{profiles.map((profile) => <article key={profile.id} className={`agent-row ${profile.id === activeProfileId ? 'is-active' : ''}`}><button type="button" className="agent-select" aria-pressed={profile.id === activeProfileId} onClick={() => { setActiveProfileId(profile.id); localStorage.setItem('persona.activeProfile', profile.id); }}><span className="agent-avatar"><Bot size={17} /></span><span><strong>{profile.name}</strong><small>{policyLabels[profile.modelPolicy]} · {profile.builtIn ? 'Persona' : 'Personalizado'}</small></span>{profile.id === activeProfileId && <Check size={16} />}</button><div className="agent-row-actions">{profile.builtIn && <button type="button" onClick={() => { setDraft({ name: `${profile.name} personalizado`, instructions: profile.instructions, modelPolicy: profile.modelPolicy }); setEditing(true); }} aria-label={`Duplicar ${profile.name}`}>Duplicar</button>}{!profile.builtIn && <button type="button" disabled={busy} onClick={() => void deleteAgent(profile)} aria-label={`Excluir ${profile.name}`}><Trash2 size={14} /></button>}</div></article>)}{!profiles.length && <p className="field-help">Nenhum agente cadastrado ainda.</p>}</div>
              <div className="agent-editor">{editing ? <form onSubmit={(event) => void saveAgent(event)}><div className="agent-editor-heading"><div><h2>{draft.id ? 'Editar agente' : 'Novo agente'}</h2><p>Defina a especialidade e o jeito de trabalhar.</p></div><button type="button" className="settings-icon-button" aria-label="Cancelar edição" onClick={() => setEditing(false)}><X size={16} /></button></div><label className="settings-label" htmlFor="agent-name">Nome<input className="settings-input" id="agent-name" value={draft.name} maxLength={60} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Analista de requisitos" required /></label><label className="settings-label" htmlFor="agent-instructions">Instruções<textarea className="settings-textarea" id="agent-instructions" value={draft.instructions} maxLength={4000} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} placeholder="O que este agente deve priorizar? Como deve estruturar a resposta?" required minLength={10} /></label><section className="agent-documents" aria-label="Documentos de referência"><div className="agent-documents-heading"><span><strong>Documentos de contexto</strong><small>PDF ou Markdown, usados como referência junto ao prompt.</small></span><button className="settings-secondary" type="button" onClick={() => void addAgentDocuments()} disabled={(draft.knowledgeFiles?.length ?? 0) >= 5}><Paperclip size={14} />Anexar</button></div>{draft.knowledgeFiles?.length ? <ul>{draft.knowledgeFiles.map((document) => <li key={document.id}><span><strong>{document.name}</strong><small>{(document.size / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</small></span><button type="button" aria-label={`Remover ${document.name}`} onClick={() => removeAgentDocument(document)}><X size={14} /></button></li>)}</ul> : <p>Nenhum documento anexado. Limite de 5 arquivos, 10 MB por arquivo.</p>}</section><label className="settings-label" htmlFor="agent-model-policy">Modelo preferido<select className="settings-select" id="agent-model-policy" value={draft.modelPolicy} onChange={(event) => setDraft((current) => ({ ...current, modelPolicy: event.target.value as ProfileModelPolicy }))}>{Object.entries(policyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="settings-primary" type="submit" disabled={busy}><Save size={15} />{busy ? 'Salvando…' : 'Salvar agente'}</button></form> : <div className="agent-overview"><Bot size={26} /><h2>{selectedProfile?.name ?? 'Escolha um agente'}</h2><p>{selectedProfile?.instructions ?? 'Crie um perfil de especialista para começar.'}</p><span>{selectedProfile ? `Ativo na barra · ${policyLabels[selectedProfile.modelPolicy]}` : 'Os agentes ficam salvos localmente neste dispositivo.'}</span></div>}</div></div>
          </>}

          {page === 'privacy' && <><div className="settings-page-heading"><div><h1>Privacidade</h1><p>Controle o que a Persona guarda e como a sobreposição se comporta.</p></div></div><section className="settings-section"><label className="settings-toggle"><span><strong>Proteção durante compartilhamento</strong><small>Tenta excluir o overlay de capturas. O suporte depende do aplicativo em uso.</small></span><input type="checkbox" checked={contentProtection} onChange={(event) => setContentProtection(event.target.checked)} /><i /></label><label className="settings-toggle"><span><strong>Memória local</strong><small>Guarda perguntas e respostas localmente. Você pode consultar e apagar pela janela Contexto.</small></span><input type="checkbox" checked={historyEnabled} onChange={(event) => setHistoryEnabled(event.target.checked)} /><i /></label><div className="settings-info"><LockKeyhole size={16} /> A chave de API é criptografada com o mecanismo seguro do Windows. O áudio da reunião é processado em trechos e não é salvo pela Persona.</div><button className="settings-secondary" type="button" onClick={() => void window.persona.diagnostics().then((value) => setDiagnostic(value.message))}>Executar diagnóstico de privacidade</button>{diagnostic && <p className="field-help" role="status">{diagnostic}</p>}</section></>}

          {page === 'appearance' && <><div className="settings-page-heading"><div><h1>Aparência</h1><p>Ajuste a escala e o posicionamento inicial do overlay.</p></div></div><section className="settings-section"><label className="settings-label" htmlFor="overlay-scale">Escala <output>{Math.round(scale * 100)}%</output></label><input id="overlay-scale" type="range" min="0.8" max="1.2" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} /><label className="settings-label" htmlFor="overlay-position">Posição do painel de resposta<select id="overlay-position" className="settings-select" value={layoutPosition} onChange={(event) => setLayoutPosition(event.target.value as typeof layoutPosition)}><option value="center">Centro</option><option value="upper-right">Superior direito</option><option value="lower-center">Inferior central</option></select></label><button className="settings-secondary" type="button" onClick={() => { window.persona.showOverlay(); window.persona.setClickThrough(false); void window.persona.closeSettings(); }}>Mover o overlay agora</button></section></>}

          {page === 'shortcuts' && <><div className="settings-page-heading"><div><h1>Atalhos</h1><p>Comandos rápidos disponíveis durante o uso da Persona.</p></div></div><section className="shortcut-list">{[['Perguntar / enviar', 'Ctrl + Enter'], ['Capturar tela', 'Ctrl + E'], ['Começar a ouvir / gerar resposta', 'Ctrl + D'], ['Mostrar / ocultar barra', 'Ctrl + M'], ['Mover interface', 'Ctrl + Shift + I'], ['Aumentar / reduzir opacidade', 'Ctrl + Shift + + / −']].map(([label, shortcut]) => <div key={label}><span><MessageSquareText size={16} />{label}</span><kbd>{shortcut}</kbd></div>)}</section></>}

          <footer className="settings-bottom"><span>Persona salva as preferências neste dispositivo.</span><button className="settings-primary" type="button" onClick={() => void saveSettings()} disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button><button className="shutdown-button" type="button" onClick={() => window.persona.quitApp()}>Encerrar Persona</button></footer>
        </section>
      </div>
    </main>
  );
}
