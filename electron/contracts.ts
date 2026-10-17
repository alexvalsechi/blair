export type PublicSettings = {
  hasApiKey: boolean;
  hasAlibabaApiKey: boolean;
  hasTypeSafeApiKey: boolean;
  analysisProvider: 'openai' | 'alibaba';
  model: string;
  transcriptionModel: string;
  transcriptionProvider: 'openai' | 'alibaba';
  alibabaWorkspaceHost: string;
  captureSourceId: string;
  opacity: number;
  contentProtection: boolean;
  historyEnabled: boolean;
  shortcuts: Record<ShortcutAction, string>;
  layoutPosition: 'center' | 'upper-right' | 'lower-center';
  scale: number;
  modelPolicy: ModelPolicy;
  policyModels: Record<ModelPolicy, string>;
  alibabaPolicyModels: Record<ModelPolicy, string>;
  alibabaReasoningEfforts: Record<string, AlibabaReasoningEffort>;
};

export type AlibabaReasoningEffort = 'default' | 'none' | 'low' | 'medium' | 'xhigh';

export type SaveSettingsInput = {
  apiKey?: string;
  alibabaApiKey?: string;
  typeSafeApiKey?: string;
  alibabaWorkspaceHost?: string;
  captureSourceId?: string;
  analysisProvider?: 'openai' | 'alibaba';
  model: string;
  transcriptionModel?: string;
  transcriptionProvider?: 'openai' | 'alibaba';
  contentProtection: boolean;
  historyEnabled?: boolean;
  shortcuts?: Partial<Record<ShortcutAction, string>>;
  layoutPosition?: PublicSettings['layoutPosition'];
  scale?: number;
  modelPolicy?: ModelPolicy;
  policyModels?: Partial<Record<ModelPolicy, string>>;
  alibabaPolicyModels?: Partial<Record<ModelPolicy, string>>;
  alibabaReasoningEfforts?: Record<string, AlibabaReasoningEffort>;
};

export type ModelPolicy = 'economy' | 'balanced' | 'quality';
export type ProfileModelPolicy = ModelPolicy | 'default';
export const MAX_INSTRUCTIONS_LENGTH = 100_000;

export type AssistantProfile = {
  id: string;
  name: string;
  instructions: string;
  knowledgeFiles?: Attachment[];
  modelPolicy: ProfileModelPolicy;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveAssistantProfileInput = {
  id?: string;
  name: string;
  instructions: string;
  knowledgeFiles?: Attachment[];
  modelPolicy: ProfileModelPolicy;
};

export type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

export type MemoryContext = {
  id: string;
  prompt: string;
  answer: string;
  createdAt: string;
};

export type CaptureSource = {
  id: string;
  name: string;
  displayId?: string;
  dataUrl: string;
  kind: 'screen' | 'window';
};

export type OverlayAudioSource = Pick<CaptureSource, 'id' | 'name'>;

export type AskInput = {
  prompt: string;
  imageDataUrl?: string;
  referenceContext?: string;
  profileId?: string;
  attachments?: Attachment[];
  contextEntries?: MemoryContext[];
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  embeddingInputTokens?: number;
};

export type MeetingAnalysisProgress = {
  stage: string;
  completed: number;
  total: number;
};

export type AskResult = {
  text: string;
  requestId?: string;
  usage?: TokenUsage;
};

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; requestId?: string; usage?: TokenUsage }
  | { type: 'incomplete'; message: string; usage?: TokenUsage }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };

export type HistoryEntry = {
  id: string;
  createdAt: string;
  prompt: string;
  answer: string;
  hasImage: boolean;
  profileId?: string;
  attachmentNames?: string[];
};

export type Diagnostics = {
  platform: string;
  windowsOnly: boolean;
  contentProtection: boolean;
  alwaysOnTop: boolean;
  message: string;
};

export type AudioSource = 'microphone' | 'computer' | 'mixed';

export type TranscribeInput = {
  audio: Uint8Array;
  mimeType: string;
  source: AudioSource;
};

export type AlibabaTranscriptionEvent =
  | { type: 'result'; sentenceId: number; sentenceEnd: boolean; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'connection'; status: 'connected' | 'reconnecting' | 'disconnected'; attempt: number; message?: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string };

export type TranscriptSegment = {
  id: string;
  createdAt: string;
  source: AudioSource;
  text: string;
};

export type MeetingSummaryInput = {
  transcript: string;
  profileId?: string;
};

export type InsightTranscriptUpdate = {
  finalized: string[];
  liveText: string;
  isFinal: boolean;
  segmentId: string;
};

export type InsightInput = InsightTranscriptUpdate & {
  profileId: string;
  visibleSuggestion: string;
};

export type InsightResult =
  | { status: 'suggestion'; text: string }
  | { status: 'skipped' };

export type ShortcutAction =
  | 'ask'
  | 'capture'
  | 'meeting'
  | 'toggle-overlay'
  | 'toggle-dock'
  | 'toggle-always-on-top'
  | 'opacity-up'
  | 'opacity-down'
  | 'toggle-interaction';
