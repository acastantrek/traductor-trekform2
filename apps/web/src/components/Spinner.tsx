/** Indicador giratorio. `sm` hereda el color del texto (botones); `lg` usa los colores de marca. Decorativo: el texto que lo acompaña es lo que se anuncia. */
export function Spinner({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return <span className={`spinner spinner-${size}`} aria-hidden="true" />;
}

/** Carga de una sección: spinner grande centrado con su texto. Aparece con un pequeño retardo para no parpadear en cargas rápidas. */
export function Loader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loader" role="status">
      <Spinner size="lg" />
      <p>{label}</p>
    </div>
  );
}

/** Carga de una página completa. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <main className="page narrow">
      <Loader label={label} />
    </main>
  );
}
