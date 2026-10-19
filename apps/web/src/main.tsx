import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './lib/auth';
import { Admin } from './pages/Admin';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Student } from './pages/Student';
import { Teacher } from './pages/Teacher';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth admin>
                <Admin />
              </RequireAuth>
            }
          />
          <Route
            path="/t/:id"
            element={
              <RequireAuth>
                <Teacher />
              </RequireAuth>
            }
          />
          {/* Alumnos: sin cuenta (PRD §5.2). */}
          <Route path="/s/:id" element={<Student />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
