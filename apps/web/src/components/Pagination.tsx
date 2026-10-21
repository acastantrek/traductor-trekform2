import { useSearchParams } from 'react-router';

export const PAGE_SIZE = 10;

/** Paginación en cliente con la página en `?pagina=N`: se conserva al recargar y con atrás/adelante. */
export function usePagination<T>(items: T[] | null, pageSize = PAGE_SIZE) {
  const [params, setParams] = useSearchParams();
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // Una página fuera de rango (p. ej. tras borrar el último curso de la última) se ajusta sola.
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('pagina')) || 1)), pages);
  const start = (page - 1) * pageSize;

  function setPage(next: number) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next <= 1) p.delete('pagina');
      else p.set('pagina', String(next));
      return p;
    });
  }

  return { page, pages, total, start, pageSize, setPage, pageItems: items?.slice(start, start + pageSize) ?? null };
}

/** Números visibles: primera, última y las vecinas de la actual; el resto se resume con «…». */
function pageList(page: number, pages: number): (number | '…')[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return shown.flatMap((p, i) => (i > 0 && p - shown[i - 1]! > 1 ? ['…' as const, p] : [p]));
}

export function Pagination({
  page,
  pages,
  total,
  start,
  pageSize,
  noun,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  start: number;
  pageSize: number;
  /** En plural: «cursos». */
  noun: string;
  onChange(page: number): void;
}) {
  if (pages <= 1) return null;
  const go = (p: number) => {
    onChange(p);
    window.scrollTo({ top: 0 });
  };
  const end = Math.min(start + pageSize, total);
  // «11 de 11» en vez de «11–11 de 11» cuando la página tiene un solo elemento.
  const range = end === start + 1 ? `${end}` : `${start + 1}–${end}`;
  return (
    <nav className="pagination" aria-label={`Páginas de ${noun}`}>
      <span className="muted small">
        {range} de {total} {noun}
      </span>
      <div className="pagination-pages">
        <button className="btn small" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Página anterior">
          ‹
        </button>
        {pageList(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="pagination-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              className="btn small"
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Página ${p}`}
              onClick={() => go(p)}
            >
              {p}
            </button>
          ),
        )}
        <button className="btn small" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Página siguiente">
          ›
        </button>
      </div>
    </nav>
  );
}
