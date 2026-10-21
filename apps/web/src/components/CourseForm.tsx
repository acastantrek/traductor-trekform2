import {
  LANGUAGE_CODES,
  LANGUAGES,
  MAX_TARGET_LANGUAGES,
  SOURCE_LANGUAGES,
  type CourseInput,
  type Language,
  type SourceLanguage,
  type TeacherSummary,
} from '@ct/shared';
import { useState, type FormEvent } from 'react';
import { Spinner } from './Spinner';

const EMPTY: CourseInput = { name: '', sourceLanguage: 'es', targetLanguages: ['en', 'fr', 'ar', 'ro'], teacherIds: [] };

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
  const [targets, setTargets] = useState<Language[]>(initial.targetLanguages);
  // Descarta asignaciones que no estén en la lista (p. ej. admins asignados antes).
  const [teacherIds, setTeacherIds] = useState(initial.teacherIds.filter((id) => teachers.some((t) => t.id === id)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const available = LANGUAGE_CODES.filter((l) => l !== source);
  const selected = targets.filter((l) => l !== source);

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), sourceLanguage: source, targetLanguages: selected, teacherIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el curso');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
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
      <fieldset className="field">
        <legend>
          Idiomas para los alumnos <span className="muted">({selected.length}/{MAX_TARGET_LANGUAGES})</span>
        </legend>
        <div className="chips">
          {available.map((l) => {
            const on = selected.includes(l);
            return (
              <label key={l} className={`chip ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && selected.length >= MAX_TARGET_LANGUAGES}
                  onChange={() => setTargets((t) => toggle(t, l))}
                />
                {LANGUAGES[l]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Profesores del curso</legend>
        {teachers.length === 0 && <p className="muted small">Todavía no hay profesores. Créalos en la pestaña Profesores.</p>}
        <div className="chips">
          {teachers.map((t) => {
            const on = teacherIds.includes(t.id);
            return (
              <label key={t.id} className={`chip ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => setTeacherIds((ids) => toggle(ids, t.id))} />
                {t.fullName || t.email}
              </label>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" disabled={busy || !name.trim() || !selected.length}>
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
