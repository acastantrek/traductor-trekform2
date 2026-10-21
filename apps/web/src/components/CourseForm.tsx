import { LANGUAGES, SOURCE_LANGUAGES, type CourseInput, type SourceLanguage, type TeacherSummary } from '@ct/shared';
import { useState, type FormEvent } from 'react';
import { MultiSelect } from './MultiSelect';
import { Spinner } from './Spinner';

const EMPTY: CourseInput = { name: '', sourceLanguage: 'es', teacherIds: [] };

interface Props {
  initial?: CourseInput;
  teachers: TeacherSummary[];
  submitLabel: string;
  onSubmit(input: CourseInput): Promise<void>;
  onCancel?(): void;
}

export function CourseForm({ initial = EMPTY, teachers, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial.name);
  const [source, setSource] = useState<SourceLanguage>(initial.sourceLanguage);
  // Descarta asignaciones que no estén en la lista (p. ej. admins asignados antes).
  const [teacherIds, setTeacherIds] = useState(initial.teacherIds.filter((id) => teachers.some((t) => t.id === id)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), sourceLanguage: source, teacherIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el curso');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span>Nombre del curso</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prevención de riesgos — Módulo 2"
            maxLength={120}
            required
          />
        </label>
        <label className="field">
          <span>Idioma del profesor</span>
          <select value={source} onChange={(e) => setSource(e.target.value as SourceLanguage)}>
            {SOURCE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGES[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">Los alumnos pueden elegir cualquiera de los idiomas disponibles.</p>
      <MultiSelect
        label="Profesores del curso"
        options={teachers.map((t) => ({ id: t.id, label: t.fullName || t.email }))}
        value={teacherIds}
        onChange={setTeacherIds}
        placeholder="Selecciona profesores"
        empty="Todavía no hay profesores. Créalos en la pestaña Profesores."
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" disabled={busy || !name.trim()}>
          {busy ? (
            <>
              <Spinner /> Guardando…
            </>
          ) : (
            submitLabel
          )}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
