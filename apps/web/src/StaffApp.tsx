import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './lib/auth';
import { Admin } from './pages/Admin';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Teacher } from './pages/Teacher';

/** Zona de profesores y admins (con Supabase Auth). Se carga bajo demanda. */
export default function StaffApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          index
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAuth admin>
              <Admin />
            </RequireAuth>
          }
        />
        <Route
          path="t/:id"
          element={
            <RequireAuth>
              <Teacher />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
