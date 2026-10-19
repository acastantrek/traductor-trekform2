// URL de la API. Vacía en desarrollo: mismo origen y proxy de Vite (/api, /ws).
// En producción, la API vive en otro dominio: VITE_API_URL=https://api.ejemplo.com
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

export function wsUrl(path: string) {
  if (API_URL) return `${API_URL.replace(/^http/, 'ws')}${path}`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}
