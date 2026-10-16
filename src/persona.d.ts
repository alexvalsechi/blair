import type {
  AskInput,
  AskResult,
  CaptureSource,
  OverlayAudioSource,
  PublicSettings,
  SaveSettingsInput,
  ShortcutAction,
  StreamEvent, HistoryEntry, Diagnostics, MeetingSummaryInput, TranscribeInput, AlibabaTranscriptionEvent, AssistantProfile, SaveAssistantProfileInput, Attachment, MeetingAnalysisProgress,
} from '../electron/contracts';

declare global {
  interface Window {
    persona: {
      getSettings(): Promise<PublicSettings>;
      saveSettings(input: SaveSettingsInput): Promise<PublicSettings>;
      onSettingsUpdated(callback: (settings: PublicSettings) => void): () => void;
      testConnection(): Promise<AskResult>;
      listModels(): Promise<string[]>;
      listAlibabaModels(): Promise<string[]>;
      listTranscriptionModels(): Promise<string[]>;
      openSettings(): Promise<void>;
      closeSettings(): Promise<void>;
      moveOverlayToDisplay(captureSourceId: string): Promise<void>;
      listCaptureSources(): Promise<CaptureSource[]>;
      getOverlayAudioSource(): Promise<OverlayAudioSource | null>;
      captureOverlayScreen(): Promise<CaptureSource | null>;
      ask(input: AskInput): Promise<AskResult>;
      askStream(input: AskInput): void;
      cancelAsk(): void;
      onStream(callback: (event: StreamEvent) => void): () => void;
      listHistory(): Promise<HistoryEntry[]>;
      clearHistory(): Promise<void>;
      searchMemory(query: string): Promise<HistoryEntry[]>;
      deleteMemory(id: string): Promise<void>;
      exportMemory(format: 'json' | 'markdown'): Promise<boolean>;
      exportAnswerPdf(html: string): Promise<string>;
      listProfiles(): Promise<AssistantProfile[]>;
      saveProfile(input: SaveAssistantProfileInput): Promise<AssistantProfile>;
      deleteProfile(id: string): Promise<void>;
      selectAttachments(): Promise<Attachment[]>;
      selectAssistantDocuments(): Promise<Attachment[]>;
      diagnostics(): Promise<Diagnostics>;
      transcribeAudio(input: TranscribeInput): Promise<string>;
      startAlibabaTranscription(sampleRate: number): Promise<void>;
      retryAlibabaTranscription(): Promise<void>;
      sendAlibabaAudioFrame(audio: Uint8Array): void;
      stopAlibabaTranscription(): Promise<void>;
      onAlibabaTranscriptionEvent(callback: (event: AlibabaTranscriptionEvent) => void): () => void;
      summarizeMeeting(input: MeetingSummaryInput): Promise<AskResult>;
      cancelMeetingAnalysis(): void;
      onMeetingAnalysisProgress(callback: (progress: MeetingAnalysisProgress) => void): () => void;
      setOpacity(value: number): Promise<PublicSettings>;
      setClickThrough(enabled: boolean): void;
      hideOverlay(): void;
      showOverlay(): void;
      focusOverlay(): Promise<void>;
      setInteractiveRegions(regions: Array<{ x: number; y: number; width: number; height: number }>): void;
      beginOverlayDrag(): void;
      endOverlayDrag(): void;
      quitApp(): void;
      onShortcut(callback: (action: ShortcutAction) => void): () => void;
    };
  }
}

export {};
