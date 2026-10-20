import logoUrl from '../assets/logo-trekform.png';

/** Logo de Trekform en negativo (texto blanco): solo sobre fondo oscuro (.appbar, .login-hero). */
export function Logo({ height = 28 }: { height?: number }) {
  return <img className="logo" src={logoUrl} alt="Trekform" height={height} width={Math.round((height * 1689) / 185)} />;
}
