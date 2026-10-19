import { LANGUAGES, type Course, type TeacherSummary } from '@ct/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppHeader } from '../components/AppHeader';
import { CourseForm } from '../components/CourseForm';
import { api } from '../lib/api';

export function Admin() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.courses(), api.teachers()]);
      setCourses(c);
      setTeachers(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const teacherName = (id: string) => {
    const t = teachers.find((x) => x.id === id);
    return t ? t.fullName || t.email : '—';
  };

  return (
    <>
      <AppHeader />
      <main className="page admin">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <section className="stack section">
          <div className="row spread">
            <h2>Cursos</h2>
            {!creating && (
              <button className="btn primary" onClick={() => setCreating(true)}>
                Nuevo curso
              </button>
            )}
          </div>
          {creating && (
            <div className="card">
              <CourseForm
                teachers={teachers}
                submitLabel="Crear curso"
                onCancel={() => setCreating(false)}
                onSubmit={async (input) => {
                  await api.createCourse(input);
                  setCreating(false);
                  await reload();
                }}
              />
            </div>
          )}
          {courses.length === 0 && !creating && <p className="muted">Aún no hay cursos.</p>}
          {courses.map((c) =>
            editing === c.id ? (
              <div key={c.id} className="card">
                <CourseForm
                  initial={c}
                  teachers={teachers}
                  submitLabel="Guardar cambios"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (input) => {
                    await api.updateCourse(c.id, input);
                    setEditing(null);
                    await reload();
                  }}
                />
              </div>
            ) : (
              <article key={c.id} className="card row spread">
                <div>
                  <h3>{c.name}</h3>
                  <p className="muted small">
                    {LANGUAGES[c.sourceLanguage]} → {c.targetLanguages.map((l) => LANGUAGES[l]).join(', ')}
                  </p>
                  <p className="small">
                    Profesores: {c.teacherIds.length ? c.teacherIds.map(teacherName).join(', ') : <em className="muted">ninguno</em>}
                  </p>
                </div>
                <button className="btn" onClick={() => setEditing(c.id)}>
                  Editar
                </button>
              </article>
            ),
          )}
        </section>

        <section className="stack section">
          <h2>Profesores</h2>
          <div className="card">
            <ul className="plain-list">
              {teachers.map((t) => (
                <li key={t.id} className="row spread">
                  <span>
                    {t.fullName || '—'} <span className="muted small">{t.email}</span>
                  </span>
                  <span className="muted small">{t.role === 'admin' ? 'Admin' : 'Profesor'}</span>
                </li>
              ))}
            </ul>
          </div>
          <NewTeacher onCreated={reload} />
        </section>
      </main>
    </>
  );
}

function NewTeacher({ onCreated }: { onCreated(): Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    setBusy(true);
    try {
      const t = await api.createTeacher({ fullName: fullName.trim(), email: email.trim(), password });
      setDone(`Cuenta creada para ${t.email}. Comparte la contraseña inicial por un canal seguro.`);
      setFullName('');
      setEmail('');
      setPassword('');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el profesor');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h3>Nuevo profesor</h3>
      <div className="form-grid">
        <label className="field">
          <span>Nombre</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
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
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="success" role="status">
          {done}
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
