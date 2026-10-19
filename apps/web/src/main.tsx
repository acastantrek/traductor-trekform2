import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Student } from './pages/Student';
import './styles.css';

// Los alumnos (móvil, Wi-Fi del aula) solo descargan su vista: sin Supabase ni pantallas de profesor.
const StaffApp = lazy(() => import('./StaffApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Alumnos: sin cuenta (PRD §5.2). */}
        <Route path="/s/:id" element={<Student />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<main className="page narrow"><p className="muted">Cargando…</p></main>}>
              <StaffApp />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
