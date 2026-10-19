import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const tag = () => process.env.E2E_TAG!;
export const password = () => process.env.E2E_PASSWORD!;
export const adminEmail = () => process.env.E2E_ADMIN_EMAIL!;
/** Marca de los cursos de esta ejecución; el teardown borra por ella. */
export const courseName = (name: string) => `${name} [e2e ${tag()}]`;
export const userEmail = (name: string) => `${name}-${tag()}@e2e.local`;
/** Sufijo único por llamada: los tests se pueden repetir en la misma ejecución (--repeat-each). */
export const unique = (name: string) => `${name}${randomBytes(3).toString('hex')}`;

export function adminDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Crea un profesor directamente en Supabase (para tests que no prueban la UI de admin). */
export async function createTeacher(base: string) {
  const name = unique(base);
  const { data, error } = await adminDb().auth.admin.createUser({
    email: userEmail(name),
    password: password(),
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(error?.message);
  return { id: data.user.id, email: userEmail(name) };
}

export async function login(page: Page, email: string, pw = password()) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(pw);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

/** Registra violaciones de CSP en todas las páginas del contexto (la CSP solo existe en el build). */
export function trackCspViolations(context: BrowserContext, violations: string[]) {
  context.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
}
