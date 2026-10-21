import type { Me, UserRole } from '@ct/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageLoader } from '../components/Spinner';
import { api, setTokenProvider } from './api';
import { accessToken, supabase } from './supabase';

setTokenProvider(accessToken);

interface AuthState {
  /** undefined mientras se comprueba la sesión guardada. */
  me: Me | null | undefined;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Cambia la contraseña propia tras comprobar la actual. */
  changePassword(current: string, next: string): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    let current = 0;
    const load = async (hasSession: boolean) => {
      const id = ++current;
      if (!hasSession) return setMe(null);
      try {
        const profile = await api.me();
        if (id === current) setMe(profile);
      } catch {
        if (id === current) setMe(null);
      }
    };
    void supabase.auth.getSession().then(({ data }) => load(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED no cambia el perfil: evita peticiones de más.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load(!!session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    me,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message);
      setMe(await api.me());
    },
    async signOut() {
      await supabase.auth.signOut();
      setMe(null);
    },
    async changePassword(current, next) {
      if (!me) throw new Error('Inicia sesión para continuar');
      // Supabase no pide la actual (secure_password_change = false): se verifica con un login.
      const check = await supabase.auth.signInWithPassword({ email: me.email, password: current });
      if (check.error) throw new Error('La contraseña actual no es correcta');
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

/** Página de inicio de cada rol: el admin solo administra; el profesor prepara sus clases. */
export const homeFor = (me: Me) => (me.role === 'admin' ? '/admin' : '/');

/** Exige sesión y, si se indica, un rol; con otro rol, lleva a su página de inicio. */
export function RequireAuth({ children, role }: { children: ReactNode; role?: UserRole }) {
  const { me } = useAuth();
  const location = useLocation();
  if (me === undefined) return <PageLoader />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && me.role !== role) return <Navigate to={homeFor(me)} replace />;
  return <>{children}</>;
}
