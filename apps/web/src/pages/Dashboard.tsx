import { LANGUAGES, type Course, type TeacherSession } from '@ct/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AppHeader } from '../components/AppHeader';
import { Loader, Spinner } from '../components/Spinner';
import { api } from '../lib/api';

const STATUS_LABEL = { ready: 'Preparada', live: 'En directo', paused: 'Pausada', ended: 'Finalizada' } as const;

/** Paso 2 del flujo del profesor (PRD §5.1): elegir curso y preparar la clase. */
export function Dashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [open, setOpen] = useState<TeacherSession[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    Promise.all([api.courses(), api.openSessions()])
      .then(([c, s]) => {
        setCourses(c);
        setOpen(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los cursos'));
  }, []);

  async function start(course: Course) {
    setBusy(course.id);
    setError('');
    try {
      const session = await api.createSession(course.id);
      navigate(`/t/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar la clase');
      setBusy('');
    }
  }

  return (
    <>
      <AppHeader />
      <main className="page">
        {open.length > 0 && (
          <section className="stack section">
            <h2>Clases abiertas</h2>
            <div className="cards">
              {open.map((s) => (
                <Link key={s.id} to={`/t/${s.id}`} className="card course-card link-card">
                  <strong>{s.title}</strong>
                  <span className={`status status-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                  <span className="muted small">Volver al panel →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="stack section">
          <h2>Mis cursos</h2>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {courses === null && !error && <Loader label="Cargando cursos…" />}
          {courses?.length === 0 && (
            <div className="card">
              <p>No tienes cursos asignados.</p>
              <p className="muted small">Pide a un administrador que te asigne a un curso.</p>
            </div>
          )}
          <div className="cards">
            {courses?.map((c) => (
              <article key={c.id} className="card course-card">
                <h3>{c.name}</h3>
                <p className="muted small">
                  {LANGUAGES[c.sourceLanguage]} → {c.targetLanguages.map((l) => LANGUAGES[l]).join(', ')}
                </p>
                <button className="btn primary" disabled={!!busy} onClick={() => void start(c)}>
                  {busy === c.id ? (
                    <>
                      <Spinner /> Preparando…
                    </>
                  ) : (
                    'Preparar clase'
                  )}
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
