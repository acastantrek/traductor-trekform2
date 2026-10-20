import { NavLink, Outlet } from 'react-router';
import { AppHeader } from '../components/AppHeader';

/** Marco de administración: pestañas Cursos / Profesores; cada una es su propia página. */
export function Admin() {
  return (
    <>
      <AppHeader />
      <main className="page admin">
        <nav className="tabs" aria-label="Administración">
          <NavLink to="/admin/cursos">Cursos</NavLink>
          <NavLink to="/admin/profesores">Profesores</NavLink>
        </nav>
        <Outlet />
      </main>
    </>
  );
}
