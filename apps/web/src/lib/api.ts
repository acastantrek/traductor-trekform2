import type {
  ApiError,
  Course,
  CourseInput,
  CreateTeacherRequest,
  Me,
  PublicSession,
  SessionAction,
  TeacherSession,
  TeacherSummary,
} from '@ct/shared';
import { apiUrl } from './config';

// La vista de alumno no carga Supabase: el token lo inyecta el módulo de auth (zona de profesor).
let tokenProvider: () => Promise<string | null> = async () => null;

export function setTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await tokenProvider();
  const { json, ...rest } = init;
  const res = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : res.statusText;
    throw new HttpError(res.status, message);
  }
  return body as T;
}

export const api = {
  me: () => request<Me>('/api/me'),

  teachers: () => request<TeacherSummary[]>('/api/teachers'),
  createTeacher: (input: CreateTeacherRequest) =>
    request<TeacherSummary>('/api/teachers', { method: 'POST', json: input }),
  setPassword: (id: string, password: string) =>
    request<void>(`/api/teachers/${encodeURIComponent(id)}/password`, { method: 'PUT', json: { password } }),

  courses: () => request<Course[]>('/api/courses'),
  createCourse: (input: CourseInput) => request<Course>('/api/courses', { method: 'POST', json: input }),
  updateCourse: (id: string, input: CourseInput) =>
    request<Course>(`/api/courses/${encodeURIComponent(id)}`, { method: 'PATCH', json: input }),

  openSessions: () => request<TeacherSession[]>('/api/sessions'),
  createSession: (courseId: string) =>
    request<TeacherSession>('/api/sessions', { method: 'POST', json: { courseId } }),
  publicSession: (id: string) => request<PublicSession>(`/api/sessions/${encodeURIComponent(id)}/public`),
  action: (id: string, action: SessionAction) =>
    request<TeacherSession>(`/api/sessions/${encodeURIComponent(id)}/${action}`, { method: 'POST', json: {} }),
};

export function studentUrl(id: string) {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || location.origin;
  return `${base.replace(/\/$/, '')}/s/${encodeURIComponent(id)}`;
}
