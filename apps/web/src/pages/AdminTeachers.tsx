import type { TeacherSummary } from '@ct/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EditIcon, EyeIcon, EyeOffIcon, TrashIcon } from '../components/Icons';
import { Modal } from '../components/Modal';
import { Pagination, usePagination } from '../components/Pagination';
import { Loader, Spinner } from '../components/Spinner';
import { useSuccessAlert } from '../components/SuccessAlert';
import { api } from '../lib/api';

const SHARE_PASSWORD = 'Comparte la contraseña por un canal seguro.';

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<TeacherSummary[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeacherSummary | null>(null);
  const [deleting, setDeleting] = useState<TeacherSummary | null>(null);
  const showAlert = useSuccessAlert();
  const pagination = usePagination(teachers);

  const reload = useCallback(async () => {
    try {
      // Los admins no son profesores.
      setTeachers((await api.teachers()).filter((u) => u.role === 'teacher'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los profesores');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Cierra los modales, avisa del éxito y recarga la lista. */
  async function done(message: string, extras?: Parameters<typeof showAlert>[1]) {
    setCreating(false);
    setEditing(null);
    setDeleting(null);
    showAlert(message, extras);
    await reload();
  }

  return (
    <section className="stack section">
      <div className="row spread">
        <h2>Profesores</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>
          Nuevo profesor
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {teachers === null && !error && <Loader label="Cargando profesores…" />}
      {teachers?.length === 0 && <p className="muted">Aún no hay profesores.</p>}
      {!!teachers?.length && (
        <div className="card">
          <ul className="plain-list user-list">
            {pagination.pageItems?.map((t) => (
              <li key={t.id} className="row spread">
                <span>
                  {t.fullName || '—'} <span className="muted small user-email">{t.email}</span>
                </span>
                <span className="row">
                  <button
                    className="btn icon"
                    aria-label={`Editar ${t.fullName || t.email}`}
                    title="Editar"
                    onClick={() => setEditing(t)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="btn icon danger-hover"
                    aria-label={`Eliminar ${t.fullName || t.email}`}
                    title="Eliminar"
                    onClick={() => setDeleting(t)}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination {...pagination} noun="profesores" onChange={pagination.setPage} />
      <Modal open={creating} title="Nuevo profesor" onClose={() => setCreating(false)}>
        <TeacherForm
          onSubmit={async (input) => {
            const t = await api.createTeacher({ ...input, password: input.password ?? '' });
            await done('Profesor creado correctamente', { detail: `Cuenta: ${t.email}`, important: SHARE_PASSWORD });
          }}
        />
      </Modal>
      <Modal open={!!editing} title="Editar profesor" onClose={() => setEditing(null)}>
        {editing && (
          <TeacherForm
            initial={editing}
            onSubmit={async (input) => {
              await api.updateTeacher(editing.id, { fullName: input.fullName, email: input.email });
              if (input.password) await api.setPassword(editing.id, input.password);
              await done('Cambios guardados correctamente', input.password ? { important: SHARE_PASSWORD } : undefined);
            }}
          />
        )}
      </Modal>
      <Modal open={!!deleting} title="Eliminar profesor" onClose={() => setDeleting(null)}>
        {deleting && (
          <DeleteTeacher
            teacher={deleting}
            onCancel={() => setDeleting(null)}
            onDeleted={() => done('Profesor eliminado correctamente')}
          />
        )}
      </Modal>
    </section>
  );
}

/** Alta (con contraseña inicial) o edición de nombre, email y, opcionalmente, contraseña. */
function TeacherForm({
  initial,
  onSubmit,
}: {
  initial?: TeacherSummary;
  onSubmit(input: { fullName: string; email: string; password?: string }): Promise<void>;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  // En la edición, la contraseña solo se pide si el admin decide cambiarla.
  const [withPassword, setWithPassword] = useState(!initial);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ fullName: fullName.trim(), email: email.trim(), ...(withPassword ? { password } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el profesor');
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
      {withPassword ? (
        <label className="field">
          <span>{initial ? 'Nueva contraseña' : 'Contraseña inicial'}</span>
          <div className="password-input">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={!!initial}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>
      ) : (
        <div className="row">
          <button type="button" className="btn small" onClick={() => setWithPassword(true)}>
            Cambiar contraseña
          </button>
        </div>
      )}
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
          ) : initial ? (
            'Guardar cambios'
          ) : (
            'Crear profesor'
          )}
        </button>
      </div>
    </form>
  );
}

function DeleteTeacher({
  teacher,
  onCancel,
  onDeleted,
}: {
  teacher: TeacherSummary;
  onCancel(): void;
  onDeleted(): Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setError('');
    setBusy(true);
    try {
      await api.deleteTeacher(teacher.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el profesor');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p>
        ¿Eliminar a <strong>{teacher.fullName || teacher.email}</strong>? Se borrará su cuenta, dejará de estar asignado a
        sus cursos y se borrará su historial de sesiones y métricas. No se puede deshacer.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn danger" disabled={busy} onClick={() => void remove()}>
          {busy ? (
            <>
              <Spinner /> Eliminando…
            </>
          ) : (
            'Eliminar profesor'
          )}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
