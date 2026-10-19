import WebSocket from 'ws';
import { z } from 'zod';
import type { SpeechToTextProvider, SttStream, SttStreamHandlers } from './types.js';

const resultSchema = z.object({
  type: z.literal('Results'),
  start: z.number(),
  duration: z.number(),
  is_final: z.boolean(),
  speech_final: z.boolean(),
  channel: z.object({
    alternatives: z.array(z.object({ transcript: z.string().max(10000) })),
  }),
});

// Frames de 100 ms: ~2 s de audio mientras se abre la conexión.
const MAX_PENDING_FRAMES = 20;

export class DeepgramProvider implements SpeechToTextProvider {
  readonly name = 'deepgram';
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  open(
    options: { language: string; sampleRate: number },
    handlers: SttStreamHandlers,
  ): SttStream {
    const query = new URLSearchParams({
      model: this.model,
      language: options.language,
      encoding: 'linear16',
      sample_rate: String(options.sampleRate),
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      endpointing: '350',
      utterance_end_ms: '1000',
      mip_opt_out: 'true',
    });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, {
      headers: { Authorization: `Token ${this.apiKey}` },
      handshakeTimeout: 8000,
      maxPayload: 1024 * 1024,
    });
    let closing = false;
    let failed = false;
    let pending: Buffer[] = [];
    let keepalive: ReturnType<typeof setInterval> | undefined;

    const fail = (error: Error) => {
      if (closing || failed) return;
      failed = true;
      if (keepalive) clearInterval(keepalive);
      ws.terminate();
      handlers.onError(error);
    };

    ws.on('open', () => {
      for (const frame of pending) ws.send(frame);
      pending = [];
      keepalive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }, 5000);
      handlers.onOpen();
    });
    ws.on('message', (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof message === 'object' && message && 'type' in message && message.type === 'Error') {
        fail(new Error('Deepgram devolvió un error'));
        return;
      }
      const parsed = resultSchema.safeParse(message);
      if (!parsed.success) return;
      const r = parsed.data;
      handlers.onResult({
        text: r.channel.alternatives[0]?.transcript ?? '',
        isFinal: r.is_final,
        speechFinal: r.speech_final,
        start: r.start,
        duration: r.duration,
      });
    });
    ws.on('unexpected-response', (_req, res) =>
      fail(new Error(`Deepgram rechazó la conexión (HTTP ${res.statusCode})`)),
    );
    ws.on('error', (err) => fail(err));
    ws.on('close', () => {
      if (keepalive) clearInterval(keepalive);
      fail(new Error('Deepgram cerró la conexión'));
    });

    return {
      send(pcm16) {
        if (closing || failed) return;
        if (ws.readyState === WebSocket.CONNECTING) {
          pending.push(pcm16);
          if (pending.length > MAX_PENDING_FRAMES) pending.shift();
        } else if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 512_000) {
          ws.send(pcm16);
        }
      },
      close() {
        if (closing) return;
        closing = true;
        if (keepalive) clearInterval(keepalive);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          ws.close();
        } else {
          ws.terminate();
        }
      },
    };
  }
}
