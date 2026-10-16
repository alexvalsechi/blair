import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import type { AlibabaTranscriptionEvent } from './contracts.js';

type Session = {
  apiKey: string;
  workspaceHost: string;
  sampleRate: number;
  socket: WebSocket | null;
  taskId: string;
  ready: boolean;
  everConnected: boolean;
  stopped: boolean;
  finishing: boolean;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  finishResolve: (() => void) | null;
  finishReject: ((error: Error) => void) | null;
  onEvent(event: AlibabaTranscriptionEvent): void;
  inputTokens: number;
  outputTokens: number;
  taskInputTokens: number;
  taskOutputTokens: number;
  audioQueue: Uint8Array[];
  queuedAudioBytes: number;
  lastQueueWarningAt: number;
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];
const MAX_QUEUED_AUDIO_BYTES = 320_000; // Aproximadamente 10 s de PCM mono a 16 kHz.
let session: Session | null = null;

function messageText(data: RawData): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function applyUsage(current: Session, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const usage = value as { input_tokens?: unknown; output_tokens?: unknown };
  const input = Number(usage.input_tokens);
  const output = Number(usage.output_tokens);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return;
  if (Number.isFinite(input)) {
    current.inputTokens += Math.max(0, input - current.taskInputTokens);
    current.taskInputTokens = Math.max(current.taskInputTokens, input);
  }
  if (Number.isFinite(output)) {
    current.outputTokens += Math.max(0, output - current.taskOutputTokens);
    current.taskOutputTokens = Math.max(current.taskOutputTokens, output);
  }
  current.onEvent({ type: 'usage', inputTokens: current.inputTokens, outputTokens: current.outputTokens });
}

function flushAudioQueue(current: Session, socket: WebSocket): void {
  while (current.audioQueue.length && current.socket === socket && socket.readyState === WebSocket.OPEN) {
    const frame = current.audioQueue.shift()!;
    current.queuedAudioBytes -= frame.byteLength;
    socket.send(frame);
  }
}

function scheduleReconnect(current: Session): void {
  if (current.stopped || current.finishing || current.reconnectTimer) return;
  if (current.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    current.onEvent({
      type: 'connection',
      status: 'disconnected',
      attempt: current.reconnectAttempts,
      message: 'A conexão com a Alibaba não voltou. A escuta continua localmente; tente reconectar.',
    });
    return;
  }
  current.reconnectAttempts += 1;
  const attempt = current.reconnectAttempts;
  current.onEvent({ type: 'connection', status: 'reconnecting', attempt });
  current.reconnectTimer = setTimeout(() => {
    current.reconnectTimer = null;
    void connectSocket(current, false).catch(() => undefined);
  }, RECONNECT_DELAYS_MS[attempt - 1]);
}

function connectSocket(current: Session, initial: boolean): Promise<void> {
  const taskId = randomUUID();
  const socket = new WebSocket(`wss://${current.workspaceHost}/api-ws/v1/inference`, {
    headers: { Authorization: `Bearer ${current.apiKey}` },
  });
  current.socket = socket;
  current.taskId = taskId;
  current.ready = false;
  current.taskInputTokens = 0;
  current.taskOutputTokens = 0;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settleInitialError = (error: Error) => {
      if (!initial || settled) return;
      settled = true;
      reject(error);
    };
    const timeout = setTimeout(() => {
      settleInitialError(new Error('Tempo esgotado ao conectar à Alibaba. Verifique o API Host, a região e a chave.'));
      socket.terminate();
    }, 20_000);

    socket.once('open', () => {
      if (current.stopped || current.socket !== socket) return;
      socket.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: 'qwen-audio-3.1-asr-flash-streaming',
            parameters: {
              format: 'pcm',
              sample_rate: current.sampleRate,
              language_hints: ['pt'],
              ...(current.sampleRate === 16_000 ? { vad_model: 'near_meeting_16k' } : {}),
              speech_noise_threshold: -0.2,
            },
          input: {},
        },
      }));
    });

    socket.on('message', (data) => {
      if (current.socket !== socket) return;
      try {
        const packet = JSON.parse(messageText(data)) as {
          header?: { event?: string; error_message?: string };
          payload?: {
            output?: {
              sentence?: {
                sentence_id?: number;
                sentence_end?: boolean;
                text?: string;
                heartbeat?: boolean;
                words?: Array<{ text?: string; punctuation?: string }>;
              };
              usage?: unknown;
            };
            usage?: unknown;
          };
        };
        const event = packet.header?.event;
        const usage = packet.payload?.usage ?? packet.payload?.output?.usage;
        if (event === 'task-started') {
          current.ready = true;
          current.everConnected = true;
          current.reconnectAttempts = 0;
          clearTimeout(timeout);
          current.onEvent({ type: 'connection', status: 'connected', attempt: 0 });
          flushAudioQueue(current, socket);
          if (!settled) { settled = true; resolve(); }
        } else if (event === 'result-generated') {
          applyUsage(current, usage);
          const sentence = packet.payload?.output?.sentence;
          if (sentence && !sentence.heartbeat) {
            const text = sentence.text || sentence.words?.map((word) => `${word.text ?? ''}${word.punctuation ?? ''}`).join('') || '';
            current.onEvent({ type: 'result', sentenceId: sentence.sentence_id ?? 0, sentenceEnd: Boolean(sentence.sentence_end), text });
          }
        } else if (event === 'task-finished') {
          applyUsage(current, usage);
          if (current.finishing) {
            current.finishResolve?.();
            current.finishResolve = null;
            current.finishReject = null;
          } else {
            socket.close();
          }
        } else if (event === 'task-failed') {
          const error = new Error(packet.header?.error_message || 'A Alibaba não conseguiu continuar a transcrição.');
          clearTimeout(timeout);
          settleInitialError(error);
          if (current.everConnected) current.onEvent({ type: 'warning', message: `${error.message} Tentando restabelecer a conexão…` });
          socket.close();
        }
      } catch {
        current.onEvent({ type: 'warning', message: 'A Alibaba retornou um evento inválido; a conexão será verificada.' });
      }
    });

    socket.once('error', () => {
      const error = new Error('Não foi possível conectar à Alibaba. Confira a chave e o API Host da região.');
      clearTimeout(timeout);
      settleInitialError(error);
      if (current.everConnected) current.onEvent({ type: 'warning', message: 'Conexão instável com a Alibaba; tentando reconectar…' });
      socket.terminate();
    });

    socket.once('close', () => {
      clearTimeout(timeout);
      if (current.socket === socket) {
        current.socket = null;
        current.ready = false;
      }
      if (!current.stopped && !current.finishing && current.everConnected) scheduleReconnect(current);
      if (current.stopped || current.finishing) current.finishResolve?.();
      if (initial && !current.everConnected) settleInitialError(new Error('A conexão com a Alibaba foi encerrada antes do início da transcrição.'));
    });
  });
}

export async function startAlibabaTranscription(
  apiKey: string,
  workspaceHost: string,
  sampleRate: number,
  onEvent: (event: AlibabaTranscriptionEvent) => void,
): Promise<void> {
  await stopAlibabaTranscription();
  const validSampleRate = Number.isInteger(sampleRate) && sampleRate >= 8_000 && sampleRate <= 192_000
    ? sampleRate
    : 16_000;
  const current: Session = {
    apiKey,
    workspaceHost,
    sampleRate: validSampleRate,
    socket: null,
    taskId: '',
    ready: false,
    everConnected: false,
    stopped: false,
    finishing: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    finishResolve: null,
    finishReject: null,
    onEvent,
    inputTokens: 0,
    outputTokens: 0,
    taskInputTokens: 0,
    taskOutputTokens: 0,
    audioQueue: [],
    queuedAudioBytes: 0,
    lastQueueWarningAt: 0,
  };
  session = current;
  try {
    await connectSocket(current, true);
  } catch (error) {
    current.stopped = true;
    if (current.socket && current.socket.readyState !== WebSocket.CLOSED) current.socket.terminate();
    if (session === current) session = null;
    throw error;
  }
}

export function sendAlibabaAudio(audio: Uint8Array): void {
  const current = session;
  if (!current || current.stopped) return;
  if (audio.byteLength > 64_000) throw new Error('O quadro de áudio excedeu o limite permitido.');
  if (current.ready && current.socket?.readyState === WebSocket.OPEN) {
    current.socket.send(audio);
    return;
  }
  if (!current.everConnected) return;
  const frame = new Uint8Array(audio);
  current.audioQueue.push(frame);
  current.queuedAudioBytes += frame.byteLength;
  let dropped = false;
  while (current.queuedAudioBytes > MAX_QUEUED_AUDIO_BYTES && current.audioQueue.length) {
    current.queuedAudioBytes -= current.audioQueue.shift()!.byteLength;
    dropped = true;
  }
  const now = Date.now();
  if (dropped && now - current.lastQueueWarningAt > 3_000) {
    current.lastQueueWarningAt = now;
    current.onEvent({ type: 'warning', message: 'A reconexão demorou; parte do áudio durante a queda não pôde ser recuperada.' });
  }
}

export async function retryAlibabaTranscription(): Promise<void> {
  const current = session;
  if (!current || current.stopped) throw new Error('A sessão de transcrição não está ativa. Encerre e inicie uma nova sessão.');
  if (current.ready || (current.socket && current.socket.readyState !== WebSocket.CLOSED)) return;
  if (current.reconnectTimer) clearTimeout(current.reconnectTimer);
  current.reconnectTimer = null;
  current.reconnectAttempts = 0;
  current.onEvent({ type: 'connection', status: 'reconnecting', attempt: 1 });
  await connectSocket(current, true);
}

export async function stopAlibabaTranscription(): Promise<void> {
  const current = session;
  if (!current) return;
  session = null;
  current.stopped = true;
  current.audioQueue = [];
  current.queuedAudioBytes = 0;
  if (current.reconnectTimer) clearTimeout(current.reconnectTimer);
  current.reconnectTimer = null;
  const socket = current.socket;
  if (current.ready && socket?.readyState === WebSocket.OPEN) {
    current.finishing = true;
    const finished = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        current.finishResolve = null;
        current.finishReject = null;
        resolve();
      }, 8_000);
      current.finishResolve = () => { clearTimeout(timeout); resolve(); };
    });
    socket.send(JSON.stringify({
      header: { action: 'finish-task', task_id: current.taskId, streaming: 'duplex' },
      payload: { input: {} },
    }));
    await finished;
  }
  if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
}
