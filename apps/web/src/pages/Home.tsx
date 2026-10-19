import { LANGUAGE_CODES, LANGUAGES, MAX_TARGET_LANGUAGES, type Language } from '@ct/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, teacherTokens } from '../lib/api';

export function Home() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<Language>('es');
  const [targets, setTargets] = useState<Language[]>(['en', 'fr', 'ar', 'ro']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const available = LANGUAGE_CODES.filter((l) => l !== source);
  const selected = targets.filter((l) => l !== source);

  function toggle(language: Language) {
    setTargets((t) => (t.includes(language) ? t.filter((l) => l !== language) : [...t, language]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { session, teacherToken } = await api.createSession({
        title,
        sourceLanguage: source,
        targetLanguages: selected,
      });
      teacherTokens.set(session.id, teacherToken);
      navigate(`/t/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sesión');
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <header className="brand">
        <h1>ClassTranslate</h1>
        <p className="muted">Subtítulos traducidos en directo para tu clase.</p>
      </header>
      <form className="card stack" onSubmit={submit}>
        <h2>Nueva clase</h2>
        <label className="field">
          <span>Nombre de la clase</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Prevención de riesgos — Módulo 2"
            maxLength={120}
            required
          />
        </label>
        <label className="field">
          <span>Idioma del profesor</span>
          <select value={source} onChange={(e) => setSource(e.target.value as Language)}>
            {LANGUAGE_CODES.map((l) => (
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
                    onChange={() => toggle(l)}
                  />
                  {LANGUAGES[l]}
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
        <button className="btn primary big" disabled={busy || !title.trim() || !selected.length}>
          {busy ? 'Creando…' : 'Preparar clase'}
        </button>
      </form>
    </main>
  );
}
