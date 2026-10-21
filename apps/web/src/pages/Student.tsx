import {
  LANGUAGES,
  WS_CLOSE,
  type Language,
  type PublicSession,
  type SessionStatus,
  type StudentServerEvent,
  type SubtitleEvent,
} from '@ct/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Logo } from '../components/Logo';
import { PageLoader } from '../components/Spinner';
import { api, HttpError } from '../lib/api';
import { connectSocket, wsUrl, type ReconnectingSocket, type SocketState } from '../lib/socket';

const MAX_LINES = 200;
// Tamaño de los subtítulos en px: pasos pequeños para que A−/A+ lo cambien de forma progresiva.
const FONT_MIN = 16;
const FONT_MAX = 64;
const FONT_STEP = 2;
const FONT_DEFAULT = 26;
const clampSize = (size: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)));

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

/** Botón que repite la acción mientras se mantiene pulsado (ratón o dedo). Con teclado, un paso por pulsación. */
function RepeatButton({
  label,
  disabled,
  onStep,
  children,
}: {
  label: string;
  disabled: boolean;
  onStep(): void;
  children: ReactNode;
}) {
  const delay = useRef(0);
  const repeat = useRef(0);
  const stop = useCallback(() => {
    window.clearTimeout(delay.current);
    window.clearInterval(repeat.current);
  }, []);

  useEffect(() => stop, [stop]);
  // Al llegar al límite el botón se deshabilita y deja de recibir pointerup: se corta aquí.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  return (
    <button
      className="btn small repeat"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        stop();
        onStep();
        delay.current = window.setTimeout(() => {
          repeat.current = window.setInterval(onStep, 90);
        }, 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // El clic de ratón/dedo ya se cuenta en pointerdown; detail = 0 es Enter o Espacio.
      onClick={(e) => e.detail === 0 && onStep()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
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
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const stored = load('ct:prefs', { size: FONT_DEFAULT, contrast: false, autoscroll: true });
    // Valores guardados por versiones anteriores (o corruptos) se ajustan al rango actual.
    return { ...stored, size: clampSize(Number(stored.size) || FONT_DEFAULT) };
  });
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

  function updatePrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
    setPrefs((p) => {
      const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch) };
      save('ct:prefs', next);
      return next;
    });
  }

  // Funcional: al mantener pulsado, cada paso parte del tamaño más reciente.
  const resize = (delta: number) => updatePrefs((p) => ({ size: clampSize(p.size + delta) }));

  if (loadError || fatal) {
    return (
      <main className="page narrow">
        <div className="card">
          <p>{loadError || fatal}</p>
        </div>
      </main>
    );
  }
  if (!session) return <PageLoader label="Cargando clase…" />;

  const allowed = [session.sourceLanguage, ...session.targetLanguages];

  if (!language) {
    return (
      <main className="page narrow">
        <header className="brand login-hero">
          <Logo height={32} />
          <h1>{session.title}</h1>
          <p>Elige tu idioma · Choose your language</p>
        </header>
        <div className="language-list">
          {allowed.map((l) => (
            <button key={l} className="language-option" lang={l} onClick={() => choose(l)}>
              <span className="language-code" aria-hidden="true">
                {l.toUpperCase()}
              </span>
              {LANGUAGES[l]}
            </button>
          ))}
        </div>
      </main>
    );
  }


  return (
    <main className={`student ${prefs.contrast ? 'contrast' : ''}`}>
      <header className="student-bar">
        <div className="student-head">
          <Logo height={18} />
          <span className="student-title">{session.title}</span>
          {status === 'live' && <span className="live-chip">En directo</span>}
        </div>
        <div className="student-controls">
          <select aria-label="Idioma" value={language} onChange={(e) => choose(e.target.value as Language)}>
            {allowed.map((l) => (
              <option key={l} value={l}>
                {LANGUAGES[l]}
              </option>
            ))}
          </select>
          <div className="tools">
            <RepeatButton label="Reducir texto" disabled={prefs.size <= FONT_MIN} onStep={() => resize(-FONT_STEP)}>
              A−
            </RepeatButton>
            <RepeatButton label="Aumentar texto" disabled={prefs.size >= FONT_MAX} onStep={() => resize(FONT_STEP)}>
              A+
            </RepeatButton>
            <button className="btn small" aria-pressed={prefs.contrast} onClick={() => updatePrefs({ contrast: !prefs.contrast })}>
              Contraste
            </button>
            <button className="btn small" aria-pressed={prefs.autoscroll} onClick={() => updatePrefs({ autoscroll: !prefs.autoscroll })}>
              Auto-scroll
            </button>
          </div>
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
        {!lines.length && <p className="placeholder">Los subtítulos aparecerán aquí.</p>}
        {lines.map((l) => (
          <p key={l.sequence}>{l.text}</p>
        ))}
        <div ref={end} />
      </section>
    </main>
  );
}
