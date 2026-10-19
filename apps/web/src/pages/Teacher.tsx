import {
  LANGUAGES,
  WS_CLOSE,
  type AudienceEvent,
  type HealthEvent,
  type PublicSession,
  type ServiceState,
  type SessionAction,
  type SessionStatus,
  type TeacherServerEvent,
} from '@ct/shared';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CAPTURE_SAMPLE_RATE, useMicrophone } from '../hooks/useMicrophone';
import { api, studentUrl, teacherTokens } from '../lib/api';
import { connectSocket, wsUrl, type ReconnectingSocket, type SocketState } from '../lib/socket';

const STATUS_LABEL: Record<SessionStatus, string> = {
  ready: 'Preparada',
  live: 'En directo',
  paused: 'Pausada',
  ended: 'Finalizada',
};

const STATE_LABEL: Record<ServiceState, string> = {
  idle: 'En espera',
  connecting: 'Conectando',
  ok: 'OK',
  error: 'Error',
};

interface Line {
  sequence: number;
  text: string;
}

export function Teacher() {
  const { id = '' } = useParams();
  const token = teacherTokens.get(id);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('ready');
  const [health, setHealth] = useState<HealthEvent | null>(null);
  const [audience, setAudience] = useState<AudienceEvent | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState('');
  const [socketState, setSocketState] = useState<SocketState>('connecting');
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const socket = useRef<ReconnectingSocket | null>(null);
  const micActive = useRef(false);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const mic = useMicrophone(
    (pcm) => socket.current?.send(pcm),
    (message) => {
      setError(message);
      socket.current?.send(JSON.stringify({ type: 'audio.stop' }));
    },
  );
  micActive.current = mic.active;

  const onEvent = useCallback((event: TeacherServerEvent) => {
    switch (event.type) {
      case 'ready':
        setSession(event.session);
        setLines([]);
        break;
      case 'session.status':
        setStatus(event.status);
        if (event.status !== 'live') setPartial('');
        break;
      case 'health':
        setHealth(event);
        break;
      case 'audience':
        setAudience(event);
        break;
      case 'transcript.partial':
        setPartial(event.text);
        break;
      case 'transcript.final':
        setPartial('');
        setLines((l) => (l.some((x) => x.sequence === event.sequence) ? l : [...l, event].slice(-30)));
        break;
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const s = connectSocket({
      url: () => wsUrl(`/ws/teacher/${encodeURIComponent(id)}`),
      onOpen: (ws) => {
        ws.send(JSON.stringify({ type: 'hello', token }));
        if (micActive.current) ws.send(JSON.stringify({ type: 'audio.start', sampleRate: CAPTURE_SAMPLE_RATE }));
      },
      onMessage: (data) => onEvent(data as TeacherServerEvent),
      onState: setSocketState,
      fatalCodes: [WS_CLOSE.notFound, WS_CLOSE.unauthorized],
      onFatal: (code) =>
        setFatal(code === WS_CLOSE.notFound ? 'La sesión no existe o ha caducado.' : 'No tienes permiso para controlar esta sesión.'),
    });
    socket.current = s;
    return () => {
      s.close();
      socket.current = null;
    };
  }, [id, token, onEvent]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'end' });
  }, [lines, partial]);

  async function startMic() {
    setError('');
    try {
      await mic.start(deviceId);
      socket.current?.send(JSON.stringify({ type: 'audio.start', sampleRate: CAPTURE_SAMPLE_RATE }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo acceder al micrófono');
      throw e;
    }
  }

  function stopMic() {
    mic.stop();
    socket.current?.send(JSON.stringify({ type: 'audio.stop' }));
  }

  async function act(action: SessionAction) {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      if ((action === 'start' || action === 'resume') && !mic.active) await startMic();
      const { session: s } = await api.action(id, action, token);
      setStatus(s.status);
      if (action === 'end') stopMic();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción');
    } finally {
      setBusy(false);
      setConfirmEnd(false);
    }
  }

  if (!token || fatal) {
    return (
      <main className="page narrow">
        <div className="card stack">
          <h1>No se puede abrir el panel</h1>
          <p>{fatal || 'Este navegador no tiene el acceso de profesor para esta sesión.'}</p>
          <Link className="btn" to="/">
            Crear una clase nueva
          </Link>
        </div>
      </main>
    );
  }

  const url = studentUrl(id);
  const isLocal = /^(localhost|127\.|\[::1\])/.test(new URL(url).hostname);
  const translationStates = Object.values(health?.translation ?? {});
  const translationState: ServiceState = translationStates.includes('error')
    ? 'error'
    : translationStates.includes('ok')
      ? 'ok'
      : translationStates.length
        ? 'connecting'
        : 'idle';

  return (
    <main className="page teacher">
      <header className="topbar">
        <div>
          <h1>{session?.title ?? 'Cargando…'}</h1>
          {session && (
            <p className="muted">
              {LANGUAGES[session.sourceLanguage]} → {session.targetLanguages.map((l) => LANGUAGES[l]).join(', ')}
            </p>
          )}
        </div>
        <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
      </header>

      <section className="grid">
        <div className="card stack controls">
          <h2>Micrófono</h2>
          <label className="field">
            <span>Entrada de audio</span>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={mic.active}>
              <option value="">Predeterminado</option>
              {mic.devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Micrófono ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className="meter" role="meter" aria-label="Nivel de audio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mic.level * 100)}>
            <div style={{ width: `${Math.round(mic.level * 100)}%` }} />
          </div>
          {mic.active ? (
            <button className="btn" onClick={stopMic}>
              Desactivar micrófono
            </button>
          ) : (
            <button className="btn" onClick={() => void startMic().catch(() => {})}>
              Probar micrófono
            </button>
          )}

          <h2>Clase</h2>
          <div className="actions">
            {status === 'ready' && (
              <button className="btn primary big" disabled={busy} onClick={() => void act('start')}>
                Iniciar clase
              </button>
            )}
            {status === 'live' && (
              <button className="btn big" disabled={busy} onClick={() => void act('pause')}>
                Pausar
              </button>
            )}
            {status === 'paused' && (
              <button className="btn primary big" disabled={busy} onClick={() => void act('resume')}>
                Reanudar
              </button>
            )}
            {status !== 'ended' &&
              (confirmEnd ? (
                <button className="btn danger big" disabled={busy} onClick={() => void act('end')}>
                  Confirmar finalizar
                </button>
              ) : (
                <button className="btn big" disabled={busy} onClick={() => setConfirmEnd(true)}>
                  Finalizar
                </button>
              ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <h2>Estado</h2>
          <ul className="health">
            <HealthItem label="Audio" state={health?.audio === 'ok' ? 'ok' : 'idle'} />
            <HealthItem label="Transcripción" state={health?.stt ?? 'idle'} />
            <HealthItem label="Traducción" state={translationState} />
            <HealthItem
              label="Conexión"
              state={socketState === 'open' ? 'ok' : socketState === 'connecting' ? 'connecting' : 'error'}
            />
          </ul>
          {health?.latency.medianMs != null && (
            <p className="muted small">
              Latencia traducción: mediana {fmt(health.latency.medianMs)} · p95 {fmt(health.latency.p95Ms)}
            </p>
          )}
        </div>

        <div className="card stack transcript-card">
          <h2>Transcripción original</h2>
          <div className="transcript" aria-live="off">
            {!lines.length && !partial && <p className="muted">La transcripción aparecerá aquí cuando empieces a hablar.</p>}
            {lines.map((l) => (
              <p key={l.sequence}>{l.text}</p>
            ))}
            {partial && <p className="partial">{partial}</p>}
            <div ref={transcriptEnd} />
          </div>
        </div>

        <div className="card stack join">
          <h2>Acceso alumnos</h2>
          <div className="qr">
            <QRCodeSVG value={url} size={200} marginSize={2} />
          </div>
          <a className="url" href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
          <button className="btn" onClick={() => void navigator.clipboard?.writeText(url)}>
            Copiar enlace
          </button>
          {isLocal && (
            <p className="hint small">
              Este enlace usa <code>localhost</code> y no abrirá en los móviles. Abre el panel con la IP de tu red o
              define <code>VITE_PUBLIC_APP_URL</code>.
            </p>
          )}
          <h2>Alumnos</h2>
          <p className="big-number">{audience?.total ?? 0}</p>
          <ul className="audience">
            {session &&
              [session.sourceLanguage, ...session.targetLanguages].map((l) => {
                const count = audience?.byLanguage[l] ?? 0;
                const active = l === session.sourceLanguage || audience?.activeLanguages.includes(l);
                return (
                  <li key={l} className={active ? '' : 'muted'}>
                    <span>{LANGUAGES[l]}</span>
                    <span>{count}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      </section>
    </main>
  );
}

function HealthItem({ label, state }: { label: string; state: ServiceState }) {
  return (
    <li className={`health-${state}`}>
      <span className="dot" aria-hidden="true" />
      {label}
      <span className="muted">{STATE_LABEL[state]}</span>
    </li>
  );
}

function fmt(ms: number | null) {
  return ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`;
}
