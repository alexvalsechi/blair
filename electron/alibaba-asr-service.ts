import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import type { AlibabaTranscriptionEvent } from './contracts.js';

type Session = {
  socket: WebSocket;
  taskId: string;
  ready: boolean;
  finishResolve: (() => void) | null;
  finishReject: ((error: Error) => void) | null;
  onEvent(event: AlibabaTranscriptionEvent): void;
};

let session: Session | null = null;

function messageText(data: RawData): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

export async function startAlibabaTranscription(
  apiKey: string,
  workspaceHost: string,
  onEvent: (event: AlibabaTranscriptionEvent) => void,
): Promise<void> {
  await stopAlibabaTranscription();
  const taskId = randomUUID();
  const socket = new WebSocket(`wss://${workspaceHost}/api-ws/v1/inference`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const current: Session = { socket, taskId, ready: false, finishResolve: null, finishReject: null, onEvent };
  session = current;

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao iniciar a transcriÃ§Ã£o Alibaba. Verifique o API Host, a regiÃ£o e a chave.')), 20_000);
    socket.once('open', () => {
      socket.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: 'qwen-audio-3.1-asr-flash-streaming',
          parameters: { format: 'pcm', sample_rate: 16_000 },
          input: {},
        },
      }));
    });
    socket.on('message', (data) => {
      try {
        const packet = JSON.parse(messageText(data)) as {
          header?: { event?: string; error_message?: string };
          payload?: { output?: { sentence?: { sentence_id?: number; sentence_end?: boolean; text?: string; heartbeat?: boolean } }; usage?: unknown };
        };
        const event = packet.header?.event;
        if (event === 'task-started') {
          current.ready = true;
          clearTimeout(timeout);
          resolve();
        } else if (event === 'result-generated') {
          const sentence = packet.payload?.output?.sentence;
          if (sentence && !sentence.heartbeat) {
            onEvent({ type: 'result', sentenceId: sentence.sentence_id ?? 0, sentenceEnd: Boolean(sentence.sentence_end), text: sentence.text ?? '' });
          }
        } else if (event === 'task-finished') {
          current.finishResolve?.();
          current.finishResolve = null;
          current.finishReject = null;
        } else if (event === 'task-failed') {
          const error = new Error(packet.header?.error_message || 'A Alibaba nÃ£o conseguiu iniciar a transcriÃ§Ã£o.');
          clearTimeout(timeout);
          if (!current.ready) reject(error);
          else onEvent({ type: 'error', message: error.message });
          current.finishReject?.(error);
          socket.close();
        }
      } catch {
        onEvent({ type: 'error', message: 'A Alibaba retornou um evento de transcriÃ§Ã£o invÃ¡lido.' });
      }
    });
    socket.once('error', () => {
      const error = new Error('NÃ£o foi possÃ­vel conectar Ã  Alibaba. Confira a chave e o API Host da regiÃ£o.');
      clearTimeout(timeout);
      if (!current.ready) reject(error);
      else onEvent({ type: 'error', message: error.message });
      current.finishReject?.(error);
    });
    socket.once('close', () => {
      clearTimeout(timeout);
      if (!current.ready) reject(new Error('A conexÃ£o Alibaba foi encerrada antes do inÃ­cio da transcriÃ§Ã£o.'));
      current.finishResolve?.();
      if (session === current) session = null;
    });
  });

  try {
    await ready;
  } catch (error) {
    socket.terminate();
    if (session === current) session = null;
    throw error;
  }
}

export function sendAlibabaAudio(audio: Uint8Array): void {
  if (!session?.ready || session.socket.readyState !== WebSocket.OPEN) return;
  if (audio.byteLength > 64_000) throw new Error('O quadro de Ã¡udio excedeu o limite permitido.');
  session.socket.send(audio);
}

export async function stopAlibabaTranscription(): Promise<void> {
  const current = session;
  if (!current) return;
  session = null;
  if (current.ready && current.socket.readyState === WebSocket.OPEN) {
    const finished = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        current.finishResolve = null;
        current.finishReject = null;
        resolve();
      }, 8_000);
      current.finishResolve = () => { clearTimeout(timeout); resolve(); };
      current.finishReject = (error) => { clearTimeout(timeout); reject(error); };
    });
    current.socket.send(JSON.stringify({
      header: { action: 'finish-task', task_id: current.taskId, streaming: 'duplex' },
      payload: { input: {} },
    }));
    await finished.catch(() => undefined);
  }
  if (current.socket.readyState !== WebSocket.CLOSED) current.socket.close();
}
