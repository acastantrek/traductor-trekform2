import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';

export function Login() {
  const { me, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <header className="brand login-hero">
        <Logo height={40} />
        <h1>ClassTranslate</h1>
        <p>Subtítulos traducidos en directo para tu clase.</p>
      </header>
      <form className="card stack" onSubmit={submit}>
        <h2>Acceso profesores</h2>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary big" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted small">¿Eres alumno? No necesitas cuenta: escanea el QR que muestra tu profesor.</p>
      </form>
    </main>
  );
}
