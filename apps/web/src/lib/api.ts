import type {
  ApiError,
  CreateSessionRequest,
  CreateSessionResponse,
  PublicSession,
  SessionAction,
} from '@ct/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : res.statusText;
    throw new HttpError(res.status, message);
  }
  return body as T;
}

export const api = {
  createSession: (input: CreateSessionRequest) =>
    request<CreateSessionResponse>('/api/sessions', { method: 'POST', body: JSON.stringify(input) }),
  publicSession: (id: string) => request<PublicSession>(`/api/sessions/${encodeURIComponent(id)}/public`),
  action: (id: string, action: SessionAction, token: string) =>
    request<{ session: PublicSession }>(`/api/sessions/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: '{}',
    }),
};

// Sin login en F0–F2: el token del profesor se guarda en este navegador.
const tokenKey = (id: string) => `ct:teacher:${id}`;

export const teacherTokens = {
  get: (id: string) => {
    try {
      return localStorage.getItem(tokenKey(id));
    } catch {
      return null;
    }
  },
  set: (id: string, token: string) => {
    try {
      localStorage.setItem(tokenKey(id), token);
    } catch {
      /* almacenamiento bloqueado: el token vive solo en esta pestaña */
    }
  },
};

export function studentUrl(id: string) {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || location.origin;
  return `${base.replace(/\/$/, '')}/s/${encodeURIComponent(id)}`;
}
