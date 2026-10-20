import { NavLink } from 'react-router';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';

export function AppHeader() {
  const { me, signOut } = useAuth();
  if (!me) return null;
  return (
    <header className="appbar">
      <NavLink to="/" className="appbar-brand" aria-label="ClassTranslate · inicio">
        <Logo />
        <span className="appbar-product">ClassTranslate</span>
      </NavLink>
      <nav className="appbar-nav">
        <NavLink to="/" end>
          Mis cursos
        </NavLink>
        {me.role === 'admin' && <NavLink to="/admin">Administración</NavLink>}
      </nav>
      <div className="appbar-user">
        <span className="small">{me.fullName || me.email}</span>
        <button className="btn small" onClick={() => void signOut()}>
          Salir
        </button>
      </div>
    </header>
  );
}
