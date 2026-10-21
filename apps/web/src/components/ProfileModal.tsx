import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

const ROLE_LABEL = { admin: 'Administrador', teacher: 'Profesor' } as const;

/** Perfil del usuario con sesión: sus datos y el cambio de su propia contraseña. */
export function ProfileModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { me } = useAuth();
  const [changing, setChanging] = useState(false);
  const [done, setDone] = useState(false);

  function close() {
    setChanging(false);
    setDone(false);
    onClose();
  }

  if (!me) return null;
  return (
    <Modal open={open} title="Mi perfil" onClose={close}>
      <dl className="profile">
        <dt>Nombre</dt>
        <dd>{me.fullName || '—'}</dd>
        <dt>Email</dt>
        <dd>{me.email}</dd>
        <dt>Rol</dt>
        <dd>{ROLE_LABEL[me.role]}</dd>
      </dl>
      {done && (
        <p className="success" role="status">
          Contraseña cambiada.
        </p>
      )}
      {changing ? (
        <PasswordForm
          onCancel={() => setChanging(false)}
          onDone={() => {
            setChanging(false);
            setDone(true);
          }}
        />
      ) : (
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setDone(false);
              setChanging(true);
            }}
          >
            Cambiar contraseña
          </button>
        </div>
      )}
    </Modal>
  );
}

function PasswordForm({ onCancel, onDone }: { onCancel(): void; onDone(): void }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden');
    if (next === current) return setError('La nueva contraseña debe ser distinta de la actual');
    setBusy(true);
    try {
      await changePassword(current, next);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Contraseña actual</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="field">
        <span>Nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Repite la nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Guardando…
            </>
          ) : (
            'Guardar contraseña'
          )}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
