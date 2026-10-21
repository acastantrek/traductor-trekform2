import { LANGUAGES, type Course, type TeacherSummary } from '@ct/shared';
import { useCallback, useEffect, useState } from 'react';
import { CourseForm } from '../components/CourseForm';
import { Loader } from '../components/Spinner';
import { api } from '../lib/api';

export function AdminCourses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
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
    <section className="stack section">
      <div className="row spread">
        <h2>Cursos</h2>
        {!creating && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            Nuevo curso
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
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
      {courses === null && !error && <Loader label="Cargando cursos…" />}
      {courses?.length === 0 && !creating && <p className="muted">Aún no hay cursos.</p>}
      {courses?.map((c) =>
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
  );
}
