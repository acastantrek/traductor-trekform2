import type { Me } from '@ct/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api } from './api';
import { supabase } from './supabase';

interface AuthState {
  /** undefined mientras se comprueba la sesión guardada. */
  me: Me | null | undefined;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
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
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { me } = useAuth();
  const location = useLocation();
  if (me === undefined) return <main className="page narrow"><p className="muted">Cargando…</p></main>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && me.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
