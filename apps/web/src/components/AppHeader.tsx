import { NavLink } from 'react-router';
import { useAuth } from '../lib/auth';

export function AppHeader() {
  const { me, signOut } = useAuth();
  if (!me) return null;
  return (
    <header className="appbar">
      <NavLink to="/" className="appbar-brand">
        ClassTranslate
      </NavLink>
      <nav className="appbar-nav">
        <NavLink to="/" end>
          Mis cursos
        </NavLink>
        {me.role === 'admin' && <NavLink to="/admin">Administración</NavLink>}
      </nav>
      <div className="appbar-user">
        <span className="muted small">{me.fullName || me.email}</span>
        <button className="btn small" onClick={() => void signOut()}>
          Salir
        </button>
      </div>
    </header>
  );
}
