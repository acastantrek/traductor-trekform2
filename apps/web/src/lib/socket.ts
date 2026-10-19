export type SocketState = 'connecting' | 'open' | 'closed';

export interface ReconnectingSocket {
  send(data: string | ArrayBuffer): boolean;
  close(): void;
}

interface Options {
  /** Se recalcula en cada intento (p. ej. para incluir `since`). */
  url: () => string;
  onOpen?: (ws: WebSocket) => void;
  onMessage: (data: unknown) => void;
  onState: (state: SocketState) => void;
  /** Códigos de cierre definitivos: no se reintenta. */
  onFatal?: (code: number) => void;
  fatalCodes?: number[];
}

export function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

/** WebSocket con reconexión exponencial (NFR-04). */
export function connectSocket(options: Options): ReconnectingSocket {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    options.onState('connecting');
    const socket = new WebSocket(options.url());
    socket.binaryType = 'arraybuffer';
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      options.onState('open');
      options.onOpen?.(socket);
    };
    socket.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        options.onMessage(JSON.parse(e.data));
      } catch {
        /* mensaje no JSON: se ignora */
      }
    };
    socket.onclose = (e) => {
      if (ws !== socket) return;
      ws = null;
      options.onState('closed');
      if (stopped) return;
      if (options.fatalCodes?.includes(e.code)) {
        options.onFatal?.(e.code);
        return;
      }
      const delay = Math.min(500 * 2 ** attempt, 8000) * (0.75 + Math.random() * 0.5);
      attempt++;
      timer = setTimeout(open, delay);
    };
  };
  open();

  return {
    send(data) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      // Si la red va lenta, descartar audio antes que acumular retraso.
      if (typeof data !== 'string' && ws.bufferedAmount > 256_000) return false;
      ws.send(data);
      return true;
    },
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
      ws = null;
    },
  };
}
