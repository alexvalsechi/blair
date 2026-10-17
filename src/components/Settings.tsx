import { Activity, Bot, Check, ChevronRight, Eye, EyeOff, Keyboard, LockKeyhole, MessageSquareText, Mic, Monitor, Paperclip, Pencil, Plus, Save, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react';
import type { AlibabaReasoningEffort, AssistantProfile, Attachment, CaptureSource, ModelPolicy, SaveAssistantProfileInput } from '../../electron/contracts';
import { MAX_INSTRUCTIONS_LENGTH } from '../../electron/contracts';
import { errorMessage } from '../lib/errors';
import { alibabaTranscriptionModelPrice, analysisModelPrice, transcriptionModelPrice } from '../lib/model-pricing';
import { filterCurrentAnalysisModels, supportsAlibabaReasoning } from '../../electron/validation';

type Page = 'connection' | 'models' | 'capture' | 'agents' | 'privacy' | 'appearance' | 'shortcuts';
type Notice = { tone: 'success' | 'error'; text: string } | null;
type ModelTask = 'analysis' | 'transcription';

const nav: { id: Page; label: string; icon: typeof Settings2 }[] = [
  { id: 'connection', label: 'Conexões', icon: Activity },
  { id: 'models', label: 'Modelos', icon: Sparkles },
  { id: 'capture', label: 'Captura de tela', icon: Monitor },
  { id: 'agents', label: 'Agentes especialistas', icon: Bot },
  { id: 'privacy', label: 'Privacidade', icon: ShieldCheck },
  { id: 'appearance', label: 'Aparência', icon: Monitor },
  { id: 'shortcuts', label: 'Atalhos', icon: Keyboard },
];

const emptyAgent: SaveAssistantProfileInput = { name: '', instructions: '', modelPolicy: 'default' };
function readModelCache(key: string, provider?: 'openai' | 'alibaba'): string[] {
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(cached) || !cached.every((item) => typeof item === 'string')) return [];
    return provider ? filterCurrentAnalysisModels(cached, provider) : cached;
  } catch { return []; }
}

function storeModelCache(key: string, models: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(models)); } catch { /* cache is optional */ }
}

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
  const [alibabaApiKey, setAlibabaApiKey] = useState('');
  const [typeSafeApiKey, setTypeSafeApiKey] = useState('');
  const [showTypeSafeKey, setShowTypeSafeKey] = useState(false);
  const [hasTypeSafeApiKey, setHasTypeSafeApiKey] = useState(false);
  const [testingTypeSafe, setTestingTypeSafe] = useState(false);
  const [showAlibabaKey, setShowAlibabaKey] = useState(false);
  const [hasAlibabaApiKey, setHasAlibabaApiKey] = useState(false);
  const [alibabaWorkspaceHost, setAlibabaWorkspaceHost] = useState('');
  const [captureSourceId, setCaptureSourceId] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [policyModels, setPolicyModels] = useState<Record<ModelPolicy, string>>({ economy: 'gpt-5.5', balanced: 'gpt-5.5', quality: 'gpt-5.5' });
  const [alibabaPolicyModels, setAlibabaPolicyModels] = useState<Record<ModelPolicy, string>>({ economy: 'qwen-turbo', balanced: 'qwen-plus', quality: 'qwen-max' });
  const [alibabaReasoningEfforts, setAlibabaReasoningEfforts] = useState<Record<string, AlibabaReasoningEffort>>({});
  const [analysisProvider, setAnalysisProvider] = useState<'openai' | 'alibaba'>('openai');
  const [transcriptionModel, setTranscriptionModel] = useState('gpt-4o-mini-transcribe');
  const [transcriptionProvider, setTranscriptionProvider] = useState<'openai' | 'alibaba'>('openai');
  const [modelOptions, setModelOptions] = useState<string[]>(() => readModelCache('persona.models.openai.analysis', 'openai'));
  const [alibabaModelOptions, setAlibabaModelOptions] = useState<string[]>(() => readModelCache('persona.models.alibaba.analysis', 'alibaba'));
  const [transcriptionOptions, setTranscriptionOptions] = useState<string[]>(() => readModelCache('persona.models.openai.transcription'));
  const [captureScreens, setCaptureScreens] = useState<CaptureSource[]>([]);
  const [modelTask, setModelTask] = useState<ModelTask>('analysis');
  const [contentProtection, setContentProtection] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [scale, setScale] = useState(1);
  const [layoutPosition, setLayoutPosition] = useState<'center' | 'upper-right' | 'lower-center'>('center');
  const [profiles, setProfiles] = useState<AssistantProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem('persona.activeProfile') ?? 'general');
  const [draft, setDraft] = useState<SaveAssistantProfileInput>(emptyAgent);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingScreens, setLoadingScreens] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [diagnostic, setDiagnostic] = useState('');

  useEffect(() => {
    void window.persona.getSettings().then((settings) => {
      setHasApiKey(settings.hasApiKey); setContentProtection(settings.contentProtection);
      setHasAlibabaApiKey(settings.hasAlibabaApiKey); setAlibabaWorkspaceHost(settings.alibabaWorkspaceHost);
      setHasTypeSafeApiKey(settings.hasTypeSafeApiKey);
      setCaptureSourceId(settings.captureSourceId);
      setHistoryEnabled(settings.historyEnabled); setPolicyModels(settings.policyModels); setAlibabaPolicyModels(settings.alibabaPolicyModels); setAlibabaReasoningEfforts(settings.alibabaReasoningEfforts); setAnalysisProvider(settings.analysisProvider); setTranscriptionModel(settings.transcriptionModel); setTranscriptionProvider(settings.transcriptionProvider);
      setScale(settings.scale); setLayoutPosition(settings.layoutPosition); setSettingsLoaded(true);
    }).catch((error) => setNotice({ tone: 'error', text: errorMessage(error) }));
    void window.persona.listProfiles().then(setProfiles);
  }, []);

  const selectedProfile = useMemo(() => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0], [activeProfileId, profiles]);
  const visibleModelOptions = analysisProvider === 'alibaba' ? alibabaModelOptions : modelOptions;
  const visiblePolicyModels = analysisProvider === 'alibaba' ? alibabaPolicyModels : policyModels;
  const selectedAnalysisModel = visiblePolicyModels.balanced;
  const selectedIsLegacy = Boolean(selectedAnalysisModel && visibleModelOptions.length && !visibleModelOptions.includes(selectedAnalysisModel));
  const catalogModelOptions = !visibleModelOptions.length || visibleModelOptions.includes(selectedAnalysisModel) || loadingModels || !selectedAnalysisModel
    ? visibleModelOptions
    : [selectedAnalysisModel, ...visibleModelOptions];
  const selectedAlibabaModel = visiblePolicyModels.balanced;
  const selectedAlibabaReasoning = alibabaReasoningEfforts[selectedAlibabaModel] ?? 'default';
  const chooseAnalysisModel = (modelId: string) => {
    if (analysisProvider === 'alibaba') setAlibabaPolicyModels({ economy: modelId, balanced: modelId, quality: modelId });
    else setPolicyModels({ economy: modelId, balanced: modelId, quality: modelId });
  };

  useEffect(() => {
    if (page !== 'capture') return;
    let active = true;
    setLoadingScreens(true);
    void window.persona.listCaptureSources()
      .then((sources) => { if (active) setCaptureScreens(sources.filter((source) => source.kind === 'screen')); })
      .catch((error) => { if (active) setNotice({ tone: 'error', text: errorMessage(error) }); })
      .finally(() => { if (active) setLoadingScreens(false); });
    return () => { active = false; };
  }, [page]);

  const saveSettings = async (event?: FormEvent) => {
    event?.preventDefault(); setBusy(true); setNotice(null);
    try {
      const saved = await window.persona.saveSettings({ apiKey: apiKey.trim() || undefined, alibabaApiKey: alibabaApiKey.trim() || undefined, typeSafeApiKey: typeSafeApiKey.trim() || undefined, alibabaWorkspaceHost, captureSourceId, analysisProvider, model: policyModels.balanced, transcriptionModel, transcriptionProvider, contentProtection, historyEnabled, modelPolicy: 'balanced', policyModels, alibabaPolicyModels, alibabaReasoningEfforts, scale, layoutPosition });
      setHasApiKey(saved.hasApiKey); setApiKey(''); setHasAlibabaApiKey(saved.hasAlibabaApiKey); setAlibabaWorkspaceHost(saved.alibabaWorkspaceHost);
      setAlibabaReasoningEfforts(saved.alibabaReasoningEfforts);
      setHasTypeSafeApiKey(saved.hasTypeSafeApiKey); setTypeSafeApiKey('');
      if (alibabaApiKey.trim() && !saved.hasAlibabaApiKey) {
        setNotice({ tone: 'error', text: 'As configurações foram salvas, mas a API Key Alibaba não foi confirmada no armazenamento seguro. A chave continua no campo para você tentar novamente.' });
        return;
      }
      setAlibabaApiKey('');
      setNotice({ tone: 'success', text: 'Configurações salvas com segurança.' });
    } catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  const selectCaptureScreen = (captureSourceId: string) => {
    setCaptureSourceId(captureSourceId);
    void window.persona.moveOverlayToDisplay(captureSourceId)
      .catch((error) => setNotice({ tone: 'error', text: errorMessage(error) }));
  };
  const isCaptureScreenSelected = (source: CaptureSource) => captureSourceId === source.id || captureSourceId === source.displayId;

  const loadModels = async () => {
    if (modelTask === 'transcription' && transcriptionProvider === 'alibaba') {
      setTranscriptionOptions(['qwen-audio-3.1-asr-flash-streaming']);
      return;
    }
    if (modelTask === 'analysis' && analysisProvider === 'alibaba') {
      if (!hasAlibabaApiKey || !alibabaWorkspaceHost) {
        setPage('connection'); setNotice({ tone: 'error', text: 'Configure a API Key Alibaba e o API Host em Conexões para carregar os modelos.' });
        return;
      }
      setLoadingModels(true); setNotice(null);
      try {
        const models = filterCurrentAnalysisModels(await window.persona.listAlibabaModels(), 'alibaba');
        setAlibabaModelOptions(models); storeModelCache('persona.models.alibaba.analysis', models);
      }
      catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
      finally { setLoadingModels(false); }
      return;
    }
    if (!hasApiKey) { setPage('connection'); setNotice({ tone: 'error', text: 'Conecte sua chave OpenAI para carregar os modelos da conta.' }); return; }
    setLoadingModels(true); setNotice(null);
    try {
      if (modelTask === 'transcription') {
        const models = await window.persona.listTranscriptionModels();
        setTranscriptionOptions(models); storeModelCache('persona.models.openai.transcription', models);
      } else {
        const models = filterCurrentAnalysisModels(await window.persona.listModels(), 'openai');
        setModelOptions(models); storeModelCache('persona.models.openai.analysis', models);
      }
    }
    catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setLoadingModels(false); }
  };

  useEffect(() => {
    if (!settingsLoaded || page !== 'models') return;
    if (modelTask === 'analysis' && analysisProvider === 'alibaba' && (!hasAlibabaApiKey || !alibabaWorkspaceHost)) return;
    if ((modelTask === 'analysis' && analysisProvider === 'openai' || modelTask === 'transcription' && transcriptionProvider === 'openai') && !hasApiKey) return;
    void loadModels();
  }, [settingsLoaded, page, modelTask, analysisProvider, transcriptionProvider, hasApiKey, hasAlibabaApiKey, alibabaWorkspaceHost]);

  const testConnection = async () => {
    setTesting(true); setNotice(null);
    try { const result = await window.persona.testConnection(); setNotice({ tone: 'success', text: result.text }); }
    catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setTesting(false); }
  };

  const testTypeSafeConnection = async () => {
    setTestingTypeSafe(true); setNotice(null);
    try { await window.persona.testTypeSafeConnection(); setNotice({ tone: 'success', text: 'Conexão TypeSafe pronta para classificar insights.' }); }
    catch (error) { setNotice({ tone: 'error', text: errorMessage(error) }); }
    finally { setTestingTypeSafe(false); }
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

  const editAgent = (profile: AssistantProfile) => {
    setDraft({ id: profile.id, name: profile.name, instructions: profile.instructions, knowledgeFiles: profile.knowledgeFiles ?? [], modelPolicy: profile.modelPolicy });
    setEditing(true);
    setNotice(null);
  };

  const duplicateAgent = (profile: AssistantProfile) => {
    setDraft({ name: `${profile.name} personalizado`, instructions: profile.instructions, knowledgeFiles: profile.knowledgeFiles ?? [], modelPolicy: profile.modelPolicy });
    setEditing(true);
    setNotice(null);
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

          {page === 'connection' && <section className="settings-section alibaba-transcription-settings" aria-label="Configuração Alibaba Cloud">
              <h2>Alibaba Cloud Model Studio</h2>
              <p className="settings-section-copy">Configure a chave e o API Host uma única vez. Eles podem ser usados tanto na transcrição quanto na análise/chat, quando a chave tiver permissão para os modelos escolhidos.</p>
              <label className="settings-label" htmlFor="alibaba-transcription-key">API Key do Model Studio</label>
              <div className="secret-field"><input id="alibaba-transcription-key" type={showAlibabaKey ? 'text' : 'password'} value={alibabaApiKey} onChange={(event) => setAlibabaApiKey(event.target.value)} placeholder={hasAlibabaApiKey ? 'Chave protegida — digite apenas para substituir' : 'Cole a API Key do Model Studio'} autoComplete="off" spellCheck={false} /><button type="button" aria-label={showAlibabaKey ? 'Ocultar chave Alibaba' : 'Mostrar chave Alibaba'} onClick={() => setShowAlibabaKey((value) => !value)}>{showAlibabaKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              <p className="field-help">{hasAlibabaApiKey ? 'Já há uma chave criptografada neste computador. Deixe em branco para mantê-la.' : 'A chave é criptografada neste computador e nunca é enviada à interface.'}</p>
              <label className="settings-label" htmlFor="alibaba-workspace-host">API Host / Workspace</label>
              <input className="settings-input" id="alibaba-workspace-host" value={alibabaWorkspaceHost} onChange={(event) => setAlibabaWorkspaceHost(event.target.value)} placeholder="ws-…ap-southeast-1.maas.aliyuncs.com" autoComplete="off" spellCheck={false} />
              <p className="field-help">Copie o valor “API Host” da tela Quick Access. A chave e o host precisam ser da mesma região e workspace.</p>
          </section>}
          {page === 'connection' && <section className="settings-section" aria-label="Configuração TypeSafe">
            <h2>TypeSafe · Jev</h2>
            <p className="settings-section-copy">O Jev avalia as falas recentes para decidir quando mostrar uma resposta sugerida. A transcrição é enviada à TypeSafe durante a sessão Ouvir.</p>
            <label className="settings-label" htmlFor="typesafe-key">API Key da TypeSafe</label>
            <div className="secret-field"><input id="typesafe-key" type={showTypeSafeKey ? 'text' : 'password'} value={typeSafeApiKey} onChange={(event) => setTypeSafeApiKey(event.target.value)} placeholder={hasTypeSafeApiKey ? 'Chave protegida — digite apenas para substituir' : 'Cole a API Key da TypeSafe'} autoComplete="off" spellCheck={false} /><button type="button" aria-label={showTypeSafeKey ? 'Ocultar chave TypeSafe' : 'Mostrar chave TypeSafe'} onClick={() => setShowTypeSafeKey((value) => !value)}>{showTypeSafeKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            <p className="field-help">A chave fica protegida pelo Windows e não é exibida novamente. Salve antes de testar a conexão.</p>
            <div className="settings-button-row"><button className="settings-secondary" type="button" disabled={!hasTypeSafeApiKey || testingTypeSafe} onClick={() => void testTypeSafeConnection()}>{testingTypeSafe ? 'Testando…' : 'Testar TypeSafe'}</button></div>
          </section>}
          {page === 'models' && <>
            <div className="settings-page-heading"><div><h1>Modelos</h1><p>Escolha os provedores e modelos para análise, chat e transcrição.</p></div>{!(modelTask === 'transcription' && transcriptionProvider === 'alibaba') && <button className="settings-secondary" type="button" onClick={() => void loadModels()} disabled={loadingModels}>{loadingModels ? 'Buscando…' : 'Atualizar modelos'}</button>}</div>
            <div className="model-task-tabs" role="tablist" aria-label="Tarefa"><button id="analysis-task-tab" type="button" role="tab" aria-controls="analysis-task-panel" aria-selected={modelTask === 'analysis'} tabIndex={modelTask === 'analysis' ? 0 : -1} className={modelTask === 'analysis' ? 'is-active' : ''} onKeyDown={moveTabFocus} onClick={() => setModelTask('analysis')}>Análise e chat</button><button id="transcription-task-tab" type="button" role="tab" aria-controls="transcription-task-panel" aria-selected={modelTask === 'transcription'} tabIndex={modelTask === 'transcription' ? 0 : -1} className={modelTask === 'transcription' ? 'is-active' : ''} onKeyDown={moveTabFocus} onClick={() => setModelTask('transcription')}>Transcrição</button><button type="button" disabled title="Tradução ainda não está disponível nesta versão">Tradução</button></div>
            {modelTask === 'analysis' ? <>
            <div id="analysis-task-panel" role="tabpanel" aria-labelledby="analysis-task-tab" tabIndex={0}>
            <div className="model-policy-tabs analysis-providers" role="group" aria-label="Provedor de análise e chat"><button type="button" className={analysisProvider === 'openai' ? 'is-active' : ''} aria-pressed={analysisProvider === 'openai'} onClick={() => setAnalysisProvider('openai')}>OpenAI</button><button type="button" className={analysisProvider === 'alibaba' ? 'is-active' : ''} aria-pressed={analysisProvider === 'alibaba'} onClick={() => setAnalysisProvider('alibaba')}>Alibaba Cloud</button></div>
            <div id="analysis-policy-panel" role="tabpanel" aria-labelledby="analysis-task-tab" tabIndex={0}>
            <p className="settings-section-copy">Escolha o modelo que será usado nas perguntas, análises e reuniões. Ferramentas e modalidades podem ter cobrança adicional.</p>
            <section className="model-catalog" aria-label="Modelos disponíveis">
              {catalogModelOptions.length ? catalogModelOptions.map((modelId) => <button type="button" key={modelId} className={`model-card ${visiblePolicyModels.balanced === modelId ? 'is-selected' : ''}`} onClick={() => chooseAnalysisModel(modelId)}><span className="model-icon">◎</span><span className="model-copy"><strong>{modelId}</strong><small>{modelId === visiblePolicyModels.balanced ? (selectedIsLegacy ? 'Selecionado · fora da lista de modelos atuais' : 'Selecionado para análise e chat') : `Modelo ${analysisProvider === 'alibaba' ? 'Alibaba Cloud' : 'OpenAI'}`}</small><small className="model-price">{analysisProvider === 'alibaba' ? 'Preço conforme tabela Model Studio' : analysisModelPrice(modelId)}</small></span>{visiblePolicyModels.balanced === modelId && <Check size={17} />}</button>) : <div className="model-empty"><Sparkles size={22} /><strong>{loadingModels ? 'Buscando modelos da sua conta…' : analysisProvider === 'alibaba' ? (hasAlibabaApiKey && alibabaWorkspaceHost ? 'Não foi possível carregar os modelos' : 'Verifique a conexão Alibaba Cloud') : (hasApiKey ? 'Não foi possível carregar os modelos' : 'Conecte a OpenAI para ver seus modelos')}</strong><span>{loadingModels ? 'A lista aparece aqui automaticamente assim que estiver pronta.' : analysisProvider === 'alibaba' ? 'Confirme a API Key e o API Host em Conexões ou tente atualizar a lista.' : (hasApiKey ? 'Confira sua conexão ou tente atualizar a lista.' : 'Você pode cadastrar uma chave na seção Conexões.')}</span>{!loadingModels && (analysisProvider === 'alibaba' ? hasAlibabaApiKey && alibabaWorkspaceHost : hasApiKey) && <button className="settings-secondary" type="button" onClick={() => void loadModels()} disabled={loadingModels}>Tentar novamente</button>}{analysisProvider === 'alibaba' && !hasAlibabaApiKey && <button className="settings-secondary" type="button" onClick={() => setPage('connection')}>Configurar API Key e Host</button>}</div>}
            </section>
            </div>
            {analysisProvider === 'alibaba' && supportsAlibabaReasoning(selectedAlibabaModel) && <section className="settings-section alibaba-reasoning-settings" aria-labelledby="alibaba-reasoning-title">
              <h2 id="alibaba-reasoning-title">Raciocínio do modelo Alibaba</h2>
              <p className="settings-section-copy">Esta escolha é salva para <strong>{selectedAlibabaModel}</strong>. O modo de raciocínio controla o equilíbrio entre velocidade e profundidade nos modelos compatíveis.</p>
              <label className="settings-label" htmlFor="alibaba-reasoning-effort">Intensidade do raciocínio
                <select id="alibaba-reasoning-effort" className="settings-select" value={selectedAlibabaReasoning} onChange={(event) => setAlibabaReasoningEfforts((current) => ({ ...current, [selectedAlibabaModel]: event.target.value as AlibabaReasoningEffort }))}>
                  <option value="default">Padrão do modelo</option>
                  <option value="none">Desativado — resposta mais direta</option>
                  <option value="low">Baixo — mais rápido</option>
                  <option value="medium">Médio</option>
                  <option value="xhigh">Máximo — raciocínio mais profundo</option>
                </select>
              </label>
              <p className="field-help">O modo escolhido só é enviado quando este modelo suporta o parâmetro. “Padrão do modelo” mantém o comportamento atual da Alibaba.</p>
            </section>}
            </div>
            </> : <>
              <div id="transcription-task-panel" role="tabpanel" aria-labelledby="transcription-task-tab" tabIndex={0}>
              <p className="settings-section-copy">Escolha qual serviço transcreve o microfone e o áudio do sistema durante as reuniões.</p>
              <div className="model-task-tabs transcription-providers" role="group" aria-label="Provedor de transcrição">
                <button type="button" className={transcriptionProvider === 'openai' ? 'is-active' : ''} aria-pressed={transcriptionProvider === 'openai'} onClick={() => { setTranscriptionProvider('openai'); if (transcriptionModel.startsWith('qwen-')) setTranscriptionModel('gpt-4o-mini-transcribe'); }}>OpenAI</button>
                <button type="button" className={transcriptionProvider === 'alibaba' ? 'is-active' : ''} aria-pressed={transcriptionProvider === 'alibaba'} onClick={() => { setTranscriptionProvider('alibaba'); setTranscriptionModel('qwen-audio-3.1-asr-flash-streaming'); setTranscriptionOptions(['qwen-audio-3.1-asr-flash-streaming']); }}>Alibaba Cloud</button>
              </div>
              <section className="model-catalog" aria-label="Modelos de transcrição">
                {transcriptionProvider === 'alibaba' ? <button type="button" className={`model-card ${transcriptionModel === 'qwen-audio-3.1-asr-flash-streaming' ? 'is-selected' : ''}`} onClick={() => setTranscriptionModel('qwen-audio-3.1-asr-flash-streaming')}><span className="model-icon"><Mic size={18} /></span><span className="model-copy"><strong>Qwen-Audio-3.1-ASR</strong><small>{transcriptionModel === 'qwen-audio-3.1-asr-flash-streaming' ? 'Selecionado · transcrição em tempo real' : 'Alibaba Cloud Model Studio · streaming'}</small><small className="model-price">{alibabaTranscriptionModelPrice(alibabaWorkspaceHost)}</small></span>{transcriptionModel === 'qwen-audio-3.1-asr-flash-streaming' && <Check size={17} />}</button> : transcriptionOptions.length ? transcriptionOptions.map((modelId) => <button type="button" key={modelId} className={`model-card ${transcriptionModel === modelId ? 'is-selected' : ''}`} onClick={() => setTranscriptionModel(modelId)}><span className="model-icon"><Mic size={18} /></span><span className="model-copy"><strong>{modelId}</strong><small>{transcriptionModel === modelId ? 'Selecionado para transcrição' : 'Modelo de áudio OpenAI'}</small><small className="model-price">{transcriptionModelPrice(modelId)}</small></span>{transcriptionModel === modelId && <Check size={17} />}</button>) : <div className="model-empty"><Mic size={22} /><strong>{loadingModels ? 'Buscando modelos de áudio…' : hasApiKey ? `Modelo atual: ${transcriptionModel}` : 'Conecte a OpenAI para listar modelos de áudio'}</strong><span>{loadingModels ? 'A lista aparece aqui automaticamente assim que estiver pronta.' : 'A lista é carregada automaticamente quando você abre esta seção.'}</span>{hasApiKey && !loadingModels && <button className="settings-secondary" type="button" onClick={() => void loadModels()}>Tentar novamente</button>}</div>}
              </section>
              {transcriptionProvider === 'alibaba' && <p className="field-help">A Alibaba cobra este modelo por tokens de áudio e texto, não por minutos; o total de 30 min varia conforme o conteúdo reconhecido.</p>}
              </div>
            </>}
          </>}

          {page === 'capture' && <>
            <div className="settings-page-heading"><div><h1>Captura de tela</h1><p>Escolha qual monitor será lido ao enviar uma captura para análise.</p></div></div>
            <section className="settings-section screen-capture-settings">
              <h2>Monitor de captura</h2>
              <p className="settings-section-copy">Selecione uma tela para mover as barras do overlay imediatamente. Salve as alterações para manter essa escolha nas próximas sessões.</p>
              <div className="screen-source-grid" role="group" aria-label="Monitor usado para captura">
                <button type="button" className={`screen-source-card ${captureSourceId === '' ? 'is-selected' : ''}`} aria-pressed={captureSourceId === ''} onClick={() => selectCaptureScreen('')}>
                  <span className="screen-source-auto"><Monitor size={24} /></span>
                  <span className="screen-source-copy"><strong>Tela atual do Persona</strong><small>Usa o monitor onde a barra estiver posicionada.</small></span>
                  {captureSourceId === '' && <Check size={17} />}
                </button>
                {captureScreens.map((source) => <button key={source.id} type="button" className={`screen-source-card ${isCaptureScreenSelected(source) ? 'is-selected' : ''}`} aria-pressed={isCaptureScreenSelected(source)} onClick={() => selectCaptureScreen(source.displayId || source.id)}>
                  <img src={source.dataUrl} alt={`Prévia de ${source.name}`} />
                  <span className="screen-source-copy"><strong>{source.name || 'Monitor'}</strong><small>{source.displayId ? `Monitor · ID ${source.displayId}` : 'Monitor detectado'}</small></span>
                  {isCaptureScreenSelected(source) && <Check size={17} />}
                </button>)}
              </div>
              {loadingScreens && <p className="field-help" role="status">Detectando monitores…</p>}
              {!loadingScreens && captureScreens.length === 0 && <div className="screen-source-empty"><Monitor size={22} /><strong>Nenhum monitor encontrado</strong><span>Verifique a conexão das telas e tente abrir esta seção novamente.</span></div>}
              {!loadingScreens && captureSourceId && !captureScreens.some((source) => source.id === captureSourceId || source.displayId === captureSourceId) && <p className="field-help" role="status">O monitor salvo não está conectado. A captura usará a tela atual até você escolher outro.</p>}
            </section>
          </>}

          {page === 'agents' && <>
            <div className="settings-page-heading"><div><h1>Agentes especialistas</h1><p>Edite os agentes existentes ou crie perfis para tarefas recorrentes.</p></div><button className="settings-primary" type="button" onClick={() => { setDraft(emptyAgent); setEditing(true); }}><Plus size={16} />Novo agente</button></div>
            <div className="agent-layout"><div className="agent-list" aria-label="Agentes disponíveis">{profiles.map((profile) => <article key={profile.id} className={`agent-row ${profile.id === activeProfileId ? 'is-active' : ''}`}><button type="button" className="agent-select" aria-pressed={profile.id === activeProfileId} onClick={() => { setActiveProfileId(profile.id); localStorage.setItem('persona.activeProfile', profile.id); }}><span className="agent-avatar"><Bot size={17} /></span><span><strong>{profile.name}</strong><small>{profile.builtIn ? 'Persona' : 'Personalizado'}</small></span>{profile.id === activeProfileId && <Check size={16} />}</button><div className="agent-row-actions"><button type="button" disabled={busy} onClick={() => editAgent(profile)} aria-label={`Editar ${profile.name}`} title="Editar"><Pencil size={14} /></button>{profile.builtIn ? <button type="button" disabled={busy} onClick={() => duplicateAgent(profile)} aria-label={`Duplicar ${profile.name}`} title="Duplicar">Duplicar</button> : <button type="button" disabled={busy} onClick={() => void deleteAgent(profile)} aria-label={`Excluir ${profile.name}`} title="Excluir"><Trash2 size={14} /></button>}</div></article>)}{!profiles.length && <p className="field-help">Nenhum agente cadastrado ainda.</p>}</div>
              <div className="agent-editor">
                {editing ? (
                  <form onSubmit={(event) => void saveAgent(event)}>
                    <div className="agent-editor-heading">
                      <div><h2>{draft.id ? 'Editar agente' : 'Novo agente'}</h2><p>Defina a especialidade e o jeito de trabalhar.</p></div>
                      <button type="button" className="settings-icon-button" aria-label="Cancelar edição" onClick={() => setEditing(false)}><X size={16} /></button>
                    </div>
                    <label className="settings-label" htmlFor="agent-name">Nome<input className="settings-input" id="agent-name" value={draft.name} maxLength={60} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Analista de requisitos" required /></label>
                    <label className="settings-label" htmlFor="agent-instructions">Instruções<textarea className="settings-textarea" id="agent-instructions" value={draft.instructions} maxLength={MAX_INSTRUCTIONS_LENGTH} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} placeholder="O que este agente deve priorizar? Como deve estruturar a resposta?" required minLength={10} /><small className="field-help">{draft.instructions.length.toLocaleString('pt-BR')} / {MAX_INSTRUCTIONS_LENGTH.toLocaleString('pt-BR')} caracteres</small></label>
                    <label className="settings-label" htmlFor="agent-model-policy">Modelo preferido<select id="agent-model-policy" className="settings-select" value={draft.modelPolicy} onChange={(event) => setDraft((current) => ({ ...current, modelPolicy: event.target.value as SaveAssistantProfileInput['modelPolicy'] }))}><option value="default">Padrão da Persona</option><option value="economy">Economia</option><option value="balanced">Equilibrado</option><option value="quality">Qualidade</option></select></label>
                    <section className="agent-documents" aria-label="Documentos de referência">
                      <div className="agent-documents-heading"><span><strong>Documentos de contexto</strong><small>Com Alibaba em Singapura, Pequim ou Hong Kong, o texto vai ao serviço de embeddings na primeira indexação e o índice fica neste computador; depois, cada pergunta envia só os trechos relevantes. Nas outras regiões, a busca é textual local. Com OpenAI, o documento segue junto ao pedido.</small></span><button className="settings-secondary" type="button" onClick={() => void addAgentDocuments()} disabled={(draft.knowledgeFiles?.length ?? 0) >= 5}><Paperclip size={14} />Anexar</button></div>
                      {draft.knowledgeFiles?.length ? <ul>{draft.knowledgeFiles.map((document) => <li key={document.id}><span><strong>{document.name}</strong><small>{(document.size / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</small></span><button type="button" aria-label={`Remover ${document.name}`} onClick={() => removeAgentDocument(document)}><X size={14} /></button></li>)}</ul> : <p>Nenhum documento anexado. Limite de 5 arquivos, 10 MB por arquivo.</p>}
                    </section>
                    <button className="settings-primary" type="submit" disabled={busy}><Save size={15} />{busy ? 'Salvando…' : 'Salvar agente'}</button>
                  </form>
                ) : <div className="agent-overview"><Bot size={26} /><h2>{selectedProfile?.name ?? 'Escolha um agente'}</h2><p>{selectedProfile?.instructions ?? 'Crie um perfil de especialista para começar.'}</p><span>{selectedProfile ? 'Modelo definido nas instruções do agente.' : 'Os agentes ficam salvos localmente neste dispositivo.'}</span></div>}
              </div></div>
          </>}

          {page === 'privacy' && <><div className="settings-page-heading"><div><h1>Privacidade</h1><p>Controle o que a Persona guarda e como a sobreposição se comporta.</p></div></div><section className="settings-section"><label className="settings-toggle"><span><strong>Proteção durante compartilhamento</strong><small>Tenta excluir o overlay de capturas. O suporte depende do aplicativo em uso.</small></span><input type="checkbox" checked={contentProtection} onChange={(event) => setContentProtection(event.target.checked)} /><i /></label><label className="settings-toggle"><span><strong>Memória local</strong><small>Guarda perguntas e respostas localmente. Você pode consultar e apagar pela janela Contexto.</small></span><input type="checkbox" checked={historyEnabled} onChange={(event) => setHistoryEnabled(event.target.checked)} /><i /></label><div className="settings-info"><LockKeyhole size={16} /> As chaves de API são criptografadas pelo Windows. O áudio é enviado ao provedor de transcrição escolhido e não é armazenado pela Persona.</div><button className="settings-secondary" type="button" onClick={() => void window.persona.diagnostics().then((value) => setDiagnostic(value.message))}>Executar diagnóstico de privacidade</button>{diagnostic && <p className="field-help" role="status">{diagnostic}</p>}</section></>}

          {page === 'appearance' && <><div className="settings-page-heading"><div><h1>Aparência</h1><p>Ajuste a escala e o posicionamento inicial do overlay.</p></div></div><section className="settings-section"><label className="settings-label" htmlFor="overlay-scale">Escala <output>{Math.round(scale * 100)}%</output></label><input id="overlay-scale" type="range" min="0.8" max="1.2" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} /><label className="settings-label" htmlFor="overlay-position">Posição do painel de resposta<select id="overlay-position" className="settings-select" value={layoutPosition} onChange={(event) => setLayoutPosition(event.target.value as typeof layoutPosition)}><option value="center">Centro</option><option value="upper-right">Superior direito</option><option value="lower-center">Inferior central</option></select></label><button className="settings-secondary" type="button" onClick={() => { window.persona.showOverlay(); window.persona.setClickThrough(false); void window.persona.closeSettings(); }}>Mover o overlay agora</button></section></>}

          {page === 'shortcuts' && <><div className="settings-page-heading"><div><h1>Atalhos</h1><p>Comandos rápidos disponíveis durante o uso da Persona.</p></div></div><section className="shortcut-list">{[['Perguntar / enviar', 'Ctrl + Enter'], ['Capturar tela', 'Ctrl + E'], ['Começar a ouvir / gerar resposta', 'Ctrl + D'], ['Mostrar / ocultar barra', 'Ctrl + M'], ['Mover interface', 'Ctrl + Shift + I'], ['Aumentar / reduzir opacidade', 'Ctrl + Shift + + / −']].map(([label, shortcut]) => <div key={label}><span><MessageSquareText size={16} />{label}</span><kbd>{shortcut}</kbd></div>)}</section></>}

          <footer className="settings-bottom"><span>Persona salva as preferências neste dispositivo.</span><button className="settings-primary" type="button" onClick={() => void saveSettings()} disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button><button className="shutdown-button" type="button" onClick={() => window.persona.quitApp()}>Encerrar Persona</button></footer>
        </section>
      </div>
    </main>
  );
}
