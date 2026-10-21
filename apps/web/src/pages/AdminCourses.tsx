import type { Course, TeacherSummary } from '@ct/shared';
import { useCallback, useEffect, useState } from 'react';
import { CourseForm } from '../components/CourseForm';
import { EditIcon, TrashIcon } from '../components/Icons';
import { Modal } from '../components/Modal';
import { Pagination, usePagination } from '../components/Pagination';
import { Loader, Spinner } from '../components/Spinner';
import { useSuccessAlert } from '../components/SuccessAlert';
import { api } from '../lib/api';

export function AdminCourses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [editing, setEditing] = useState<Course | null>(null);
  const [creating, setCreating] = useState(false);
  const showAlert = useSuccessAlert();
  const pagination = usePagination(courses);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.courses(), api.teachers()]);
      setCourses(c);
      // El admin abre cualquier curso sin estar asignado: solo se asignan profesores.
      setTeachers(t.filter((u) => u.role === 'teacher'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const teacherNames = (c: Course) =>
    teachers.filter((t) => c.teacherIds.includes(t.id)).map((t) => t.fullName || t.email);

  return (
    <section className="stack section">
      <div className="row spread">
        <h2>Cursos</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>
          Nuevo curso
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {courses === null && !error && <Loader label="Cargando cursos…" />}
      {courses?.length === 0 && <p className="muted">Aún no hay cursos.</p>}
      {pagination.pageItems?.map((c) => (
        <article key={c.id} className="card row spread">
          <div>
            <h3>{c.name}</h3>
            <p className="small">
              Profesores: {teacherNames(c).join(', ') || <em className="muted">ninguno</em>}
            </p>
          </div>
          <div className="row">
            <button className="btn icon" aria-label={`Editar ${c.name}`} title="Editar" onClick={() => setEditing(c)}>
              <EditIcon />
            </button>
            <button
              className="btn icon danger-hover"
              aria-label={`Eliminar ${c.name}`}
              title="Eliminar"
              onClick={() => setDeleting(c)}
            >
              <TrashIcon />
            </button>
          </div>
        </article>
      ))}
      <Pagination {...pagination} noun="cursos" onChange={pagination.setPage} />
      <Modal open={creating} title="Nuevo curso" onClose={() => setCreating(false)}>
        <CourseForm
          teachers={teachers}
          submitLabel="Crear curso"
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await api.createCourse(input);
            setCreating(false);
            // Los cursos van del más reciente al más antiguo: el nuevo queda en la primera página.
            pagination.setPage(1);
            showAlert('Curso creado correctamente');
            await reload();
          }}
        />
      </Modal>
      <Modal open={!!editing} title="Editar curso" onClose={() => setEditing(null)}>
        {editing && (
          <CourseForm
            initial={editing}
            teachers={teachers}
            submitLabel="Guardar cambios"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await api.updateCourse(editing.id, input);
              setEditing(null);
              showAlert('Cambios guardados correctamente');
              await reload();
            }}
          />
        )}
      </Modal>
      <Modal open={!!deleting} title="Eliminar curso" onClose={() => setDeleting(null)}>
        {deleting && (
          <DeleteCourse
            course={deleting}
            onCancel={() => setDeleting(null)}
            onDeleted={async () => {
              setDeleting(null);
              showAlert('Curso eliminado correctamente');
              await reload();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

function DeleteCourse({ course, onCancel, onDeleted }: { course: Course; onCancel(): void; onDeleted(): Promise<void> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setError('');
    setBusy(true);
    try {
      await api.deleteCourse(course.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el curso');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p>
        ¿Eliminar <strong>{course.name}</strong>? También se borrarán sus asignaciones y todo su historial de sesiones y
        métricas. No se puede deshacer.
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
            'Eliminar curso'
          )}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
