import { contextBridge, ipcRenderer } from 'electron';
import type {
  AskInput,
  AskResult,
  CaptureSource,
  OverlayAudioSource,
  PublicSettings,
  SaveSettingsInput,
  ShortcutAction,
  StreamEvent, HistoryEntry, Diagnostics, MeetingSummaryInput, TranscribeInput, AssistantProfile, SaveAssistantProfileInput, Attachment,
} from './contracts.js';

contextBridge.exposeInMainWorld('persona', {
  getSettings: (): Promise<PublicSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SaveSettingsInput): Promise<PublicSettings> =>
    ipcRenderer.invoke('settings:save', input),
  testConnection: (): Promise<AskResult> => ipcRenderer.invoke('settings:test'),
  listModels: (): Promise<string[]> => ipcRenderer.invoke('models:list'),
  listTranscriptionModels: (): Promise<string[]> => ipcRenderer.invoke('models:transcription-list'),
  openSettings: (): Promise<void> => ipcRenderer.invoke('window:open-settings'),
  closeSettings: (): Promise<void> => ipcRenderer.invoke('window:close-settings'),
  listCaptureSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('capture:list-sources'),
  getOverlayAudioSource: (): Promise<OverlayAudioSource | null> => ipcRenderer.invoke('capture:get-overlay-audio-source'),
  captureOverlayScreen: (): Promise<CaptureSource | null> => ipcRenderer.invoke('capture:overlay-screen'),
  ask: (input: AskInput): Promise<AskResult> => ipcRenderer.invoke('assistant:ask', input),
  askStream: (input: AskInput): void => ipcRenderer.send('assistant:ask-stream', input),
  cancelAsk: (): void => ipcRenderer.send('assistant:cancel'),
  onStream: (callback: (event: StreamEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: StreamEvent) => callback(value);
    ipcRenderer.on('assistant:stream-event', listener);
    return () => ipcRenderer.removeListener('assistant:stream-event', listener);
  },
  listHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('history:clear'),
  searchMemory: (query: string): Promise<HistoryEntry[]> => ipcRenderer.invoke('memory:search', query),
  deleteMemory: (id: string): Promise<void> => ipcRenderer.invoke('memory:delete', id),
  exportMemory: (format: 'json' | 'markdown'): Promise<boolean> => ipcRenderer.invoke('memory:export', format),
  listProfiles: (): Promise<AssistantProfile[]> => ipcRenderer.invoke('profiles:list'),
  saveProfile: (input: SaveAssistantProfileInput): Promise<AssistantProfile> => ipcRenderer.invoke('profiles:save', input),
  deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke('profiles:delete', id),
  selectAttachments: (): Promise<Attachment[]> => ipcRenderer.invoke('attachments:select'),
  selectAssistantDocuments: (): Promise<Attachment[]> => ipcRenderer.invoke('assistant-documents:select'),
  diagnostics: (): Promise<Diagnostics> => ipcRenderer.invoke('privacy:diagnose'),
  transcribeAudio: (input: TranscribeInput): Promise<string> => ipcRenderer.invoke('audio:transcribe', input),
  summarizeMeeting: (input: MeetingSummaryInput): Promise<AskResult> => ipcRenderer.invoke('meeting:summarize', input),
  setOpacity: (value: number): Promise<PublicSettings> => ipcRenderer.invoke('overlay:set-opacity', value),
  setClickThrough: (enabled: boolean): void => ipcRenderer.send('overlay:set-click-through', enabled),
  hideOverlay: (): void => ipcRenderer.send('overlay:hide'),
  showOverlay: (): void => ipcRenderer.send('overlay:show'),
  setInteractiveRegions: (regions: Array<{ x: number; y: number; width: number; height: number }>): void => ipcRenderer.send('overlay:set-interactive-regions', regions),
  beginOverlayDrag: (): void => ipcRenderer.send('overlay:drag-start'),
  endOverlayDrag: (): void => ipcRenderer.send('overlay:drag-end'),
  quitApp: (): void => ipcRenderer.send('app:quit'),
  onShortcut: (callback: (action: ShortcutAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: ShortcutAction) => callback(action);
    ipcRenderer.on('shortcut', listener);
    return () => ipcRenderer.removeListener('shortcut', listener);
  },
});
