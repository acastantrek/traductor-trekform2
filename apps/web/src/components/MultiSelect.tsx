import { useEffect, useId, useRef, useState } from 'react';

interface Option {
  id: string;
  label: string;
}

// Búsqueda sin distinguir mayúsculas ni tildes: «garcia» encuentra «García».
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Desplegable de selección múltiple: un botón con lo elegido que abre debajo una lista con
 * casillas y buscador. La lista va en el flujo de la página (no flotante) para que un modal
 * con scroll no la recorte.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  empty,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange(value: string[]): void;
  /** Texto del botón sin nada elegido. */
  placeholder: string;
  /** Texto si no hay opciones. */
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const id = useId();

  // Se cierra al hacer clic fuera. En «click» y no en «pointerdown»: cerrar antes de soltar
  // encoge el modal y el clic acababa en su fondo, cerrándolo también.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  const selected = options.filter((o) => value.includes(o.id));
  const q = normalize(query.trim());
  const visible = q ? options.filter((o) => normalize(o.label).includes(q)) : options;
  const toggle = (optionId: string) =>
    onChange(value.includes(optionId) ? value.filter((v) => v !== optionId) : [...value, optionId]);

  function close() {
    setOpen(false);
    setQuery('');
    toggleButton.current?.focus();
  }

  return (
    <div
      className="field multiselect"
      ref={root}
      onKeyDown={(e) => {
        // Esc cierra solo el desplegable, no el modal que lo contiene.
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={toggleButton}
        type="button"
        className="multiselect-toggle"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-labelledby={`${id}-label ${id}-value`}
        disabled={!options.length}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span id={`${id}-value`} className={selected.length ? 'multiselect-value' : 'multiselect-value muted'}>
          {!options.length ? empty : selected.length ? selected.map((o) => o.label).join(', ') : placeholder}
        </span>
        {selected.length > 0 && <span className="multiselect-count">{selected.length}</span>}
        <span className="multiselect-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div id={`${id}-panel`} className="multiselect-panel">
          {options.length > 6 && (
            <input
              type="search"
              className="multiselect-search"
              placeholder="Buscar…"
              aria-label={`Buscar en ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}
          <div role="group" aria-labelledby={`${id}-label`} className="multiselect-options">
            {visible.map((o) => (
              <label key={o.id} className="multiselect-option">
                <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
                {o.label}
              </label>
            ))}
            {!visible.length && <p className="muted small multiselect-none">Sin resultados.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
