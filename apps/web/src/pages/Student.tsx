import {
  LANGUAGES,
  WS_CLOSE,
  type Language,
  type PublicSession,
  type SessionStatus,
  type StudentServerEvent,
  type SubtitleEvent,
} from '@ct/shared';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { api, HttpError } from '../lib/api';
import { connectSocket, wsUrl, type ReconnectingSocket, type SocketState } from '../lib/socket';

const MAX_LINES = 200;
const FONT_SIZES = [18, 22, 26, 32, 40];

interface Prefs {
  size: number;
  contrast: boolean;
  autoscroll: boolean;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* sin almacenamiento: preferencias solo en memoria */
  }
}

function merge(lines: SubtitleEvent[], incoming: SubtitleEvent[]) {
  const bySeq = new Map(lines.map((l) => [l.sequence, l]));
  for (const l of incoming) bySeq.set(l.sequence, l);
  return [...bySeq.values()].sort((a, b) => a.sequence - b.sequence).slice(-MAX_LINES);
}

export function Student() {
  const { id = '' } = useParams();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loadError, setLoadError] = useState('');
  const [language, setLanguage] = useState<Language | null>(null);
  const [lines, setLines] = useState<SubtitleEvent[]>([]);
  const [status, setStatus] = useState<SessionStatus>('ready');
  const [socketState, setSocketState] = useState<SocketState>('connecting');
  const [fatal, setFatal] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(() => load('ct:prefs', { size: 26, contrast: false, autoscroll: true }));
  const socket = useRef<ReconnectingSocket | null>(null);
  const languageRef = useRef<Language | null>(null);
  const lastSequence = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .publicSession(id)
      .then((s) => {
        setSession(s);
        setStatus(s.status);
        const allowed = [s.sourceLanguage, ...s.targetLanguages];
        const remembered = (() => {
          try {
            return localStorage.getItem(`ct:lang:${id}`);
          } catch {
            return null;
          }
        })();
        if (remembered && allowed.includes(remembered as Language)) setLanguage(remembered as Language);
      })
      .catch((e) =>
        setLoadError(e instanceof HttpError && e.status === 404 ? 'Esta clase no existe o ya ha caducado.' : 'No se pudo cargar la clase.'),
      );
  }, [id]);

  const connected = language !== null && session !== null && status !== 'ended';

  useEffect(() => {
    if (!connected) return;
    const s = connectSocket({
      url: () =>
        wsUrl(`/ws/student/${encodeURIComponent(id)}?lang=${languageRef.current}&since=${lastSequence.current}`),
      onMessage: (data) => {
        const event = data as StudentServerEvent;
        if (event.type === 'session.status') setStatus(event.status);
        else if (event.type === 'subtitle.backlog' || event.type === 'subtitle.final') {
          const items = event.type === 'subtitle.backlog' ? event.items : [event];
          const current = items.filter((i) => i.language === languageRef.current);
          for (const i of current) lastSequence.current = Math.max(lastSequence.current, i.sequence);
          if (current.length) setLines((l) => merge(l, current));
        }
      },
      onState: setSocketState,
      fatalCodes: [WS_CLOSE.notFound, WS_CLOSE.ended, WS_CLOSE.badRequest, WS_CLOSE.full],
      onFatal: (code) => {
        if (code === WS_CLOSE.ended) setStatus('ended');
        else
          setFatal(
            code === WS_CLOSE.full
              ? 'La clase está completa.'
              : code === WS_CLOSE.notFound
                ? 'Esta clase ya no está disponible.'
                : 'No se pudo unir a la clase.',
          );
      },
    });
    socket.current = s;
    return () => {
      s.close();
      socket.current = null;
    };
    // El idioma se cambia por mensaje, sin reconectar.
  }, [connected, id]);

  useEffect(() => {
    if (prefs.autoscroll) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [lines, prefs.autoscroll]);

  function choose(next: Language) {
    if (next === languageRef.current) return;
    languageRef.current = next;
    lastSequence.current = 0;
    setLines([]);
    setLanguage(next);
    save(`ct:lang:${id}`, next);
    socket.current?.send(JSON.stringify({ type: 'language.set', language: next }));
  }
  languageRef.current = language;

  function updatePrefs(patch: Partial<Prefs>) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      save('ct:prefs', next);
      return next;
    });
  }

  if (loadError || fatal) {
    return (
      <main className="page narrow">
        <div className="card">
          <p>{loadError || fatal}</p>
        </div>
      </main>
    );
  }
  if (!session) return <main className="page narrow"><p className="muted">Cargando clase…</p></main>;

  const allowed = [session.sourceLanguage, ...session.targetLanguages];

  if (!language) {
    return (
      <main className="page narrow">
        <header className="brand">
          <h1>{session.title}</h1>
          <p className="muted">Elige tu idioma · Choose your language</p>
        </header>
        <div className="language-list">
          {allowed.map((l) => (
            <button key={l} className="btn big" lang={l} onClick={() => choose(l)}>
              {LANGUAGES[l]}
            </button>
          ))}
        </div>
      </main>
    );
  }

  const sizeIndex = FONT_SIZES.indexOf(prefs.size);

  return (
    <main className={`student ${prefs.contrast ? 'contrast' : ''}`}>
      <header className="student-bar">
        <select aria-label="Idioma" value={language} onChange={(e) => choose(e.target.value as Language)}>
          {allowed.map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l]}
            </option>
          ))}
        </select>
        <div className="tools">
          <button
            className="btn small"
            aria-label="Reducir texto"
            disabled={sizeIndex <= 0}
            onClick={() => updatePrefs({ size: FONT_SIZES[Math.max(0, sizeIndex - 1)]! })}
          >
            A−
          </button>
          <button
            className="btn small"
            aria-label="Aumentar texto"
            disabled={sizeIndex >= FONT_SIZES.length - 1}
            onClick={() => updatePrefs({ size: FONT_SIZES[Math.min(FONT_SIZES.length - 1, sizeIndex + 1)]! })}
          >
            A+
          </button>
          <button className="btn small" aria-pressed={prefs.contrast} onClick={() => updatePrefs({ contrast: !prefs.contrast })}>
            Contraste
          </button>
          <button className="btn small" aria-pressed={prefs.autoscroll} onClick={() => updatePrefs({ autoscroll: !prefs.autoscroll })}>
            Auto-scroll
          </button>
        </div>
      </header>

      {status !== 'live' && (
        <p className="banner" role="status">
          {status === 'ready' && 'La clase aún no ha empezado.'}
          {status === 'paused' && 'Clase en pausa.'}
          {status === 'ended' && 'La clase ha finalizado.'}
        </p>
      )}
      {status !== 'ended' && socketState !== 'open' && (
        <p className="banner warn" role="status">
          Reconectando…
        </p>
      )}

      <section className="subtitles" lang={language} aria-live="polite" style={{ fontSize: prefs.size }}>
        {!lines.length && <p className="muted">Los subtítulos aparecerán aquí.</p>}
        {lines.map((l) => (
          <p key={l.sequence}>{l.text}</p>
        ))}
        <div ref={end} />
      </section>
    </main>
  );
}
