import { useState } from 'react';
import { NavLink } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';
import { Logo } from './Logo';
import { ProfileModal } from './ProfileModal';

export function AppHeader() {
  const { me, signOut } = useAuth();
  const [profile, setProfile] = useState(false);
  if (!me) return null;
  return (
    <>
      <header className="appbar">
        <NavLink to={homeFor(me)} className="appbar-brand" aria-label="ClassTranslate · inicio">
          <Logo />
          <span className="appbar-product">ClassTranslate</span>
        </NavLink>
        <nav className="appbar-nav">
          {/* El admin no prepara clases: solo ve la administración. */}
          {me.role === 'admin' ? (
            <NavLink to="/admin">Administración</NavLink>
          ) : (
            <NavLink to="/" end>
              Mis cursos
            </NavLink>
          )}
        </nav>
        <div className="appbar-user">
          <button className="appbar-profile" aria-haspopup="dialog" onClick={() => setProfile(true)}>
            {me.fullName || me.email}
          </button>
          <button className="btn small" onClick={() => void signOut()}>
            Salir
          </button>
        </div>
      </header>
      {/* Fuera de la barra: así no hereda los estilos de .appbar. */}
      <ProfileModal open={profile} onClose={() => setProfile(false)} />
    </>
  );
}
