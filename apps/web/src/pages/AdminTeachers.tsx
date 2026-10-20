import type { TeacherSummary } from '@ct/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { api } from '../lib/api';

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState('');

  const reload = useCallback(async () => {
    try {
      setTeachers(await api.teachers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los profesores');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="stack section">
      <div className="row spread">
        <h2>Profesores</h2>
        <button
          className="btn primary"
          onClick={() => {
            setCreated('');
            setCreating(true);
          }}
        >
          Nuevo profesor
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {created && (
        <p className="success" role="status">
          {created}
        </p>
      )}
      <div className="card">
        <ul className="plain-list user-list">
          {teachers.map((t) => (
            <UserRow key={t.id} user={t} />
          ))}
        </ul>
      </div>
      <Modal open={creating} title="Nuevo profesor" onClose={() => setCreating(false)}>
        <NewTeacher
          onCreated={async (email) => {
            setCreating(false);
            setCreated(`Cuenta creada para ${email}. Comparte la contraseña inicial por un canal seguro.`);
            await reload();
          }}
        />
      </Modal>
    </section>
  );
}

/** Fila de usuario (profesor o admin) con cambio de contraseña en línea. */
function UserRow({ user }: { user: TeacherSummary }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle() {
    setOpen(!open);
    setPassword('');
    setError('');
    setDone('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.setPassword(user.id, password);
      setOpen(false);
      setPassword('');
      setDone('Contraseña cambiada. Compártela por un canal seguro.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="stack">
      <div className="row spread">
        <span>
          {user.fullName || '—'} <span className="muted small">{user.email}</span>
        </span>
        <span className="row">
          <span className="muted small">{user.role === 'admin' ? 'Admin' : 'Profesor'}</span>
          <button className="btn small" aria-expanded={open} onClick={toggle}>
            {open ? 'Cancelar' : 'Cambiar contraseña'}
          </button>
        </span>
      </div>
      {open && (
        <form className="row password-form" onSubmit={submit}>
          <label className="field">
            <span>Nueva contraseña para {user.fullName || user.email}</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="success small" role="status">
          {done}
        </p>
      )}
    </li>
  );
}

function NewTeacher({ onCreated }: { onCreated(email: string): Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const t = await api.createTeacher({ fullName: fullName.trim(), email: email.trim(), password });
      await onCreated(t.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el profesor');
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Nombre</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required autoFocus />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Contraseña inicial</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          {busy ? 'Creando…' : 'Crear profesor'}
        </button>
      </div>
    </form>
  );
}
