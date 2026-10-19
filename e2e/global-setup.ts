import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Crea un admin desechable en Supabase local y devuelve el teardown que borra
 * todo lo creado por esta ejecución (usuarios y cursos marcados con E2E_TAG).
 */
export default async function globalSetup() {
  const url = process.env.SUPABASE_URL ?? '';
  const secret = process.env.SUPABASE_SECRET_KEY ?? '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url))
    throw new Error(`E2E solo contra Supabase local (SUPABASE_URL=${url || 'vacía'}). ¿Has hecho npx supabase start?`);

  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = randomBytes(4).toString('hex');
  const password = `e2e-${randomBytes(8).toString('hex')}`;
  const email = `admin-${tag}@e2e.local`;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Admin E2E ${tag}` },
  });
  if (error || !data.user) throw new Error(`No se pudo crear el admin E2E: ${error?.message}`);
  const promote = await db.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
  if (promote.error) throw new Error(promote.error.message);

  // Visibles para los workers.
  process.env.E2E_TAG = tag;
  process.env.E2E_ADMIN_EMAIL = email;
  process.env.E2E_PASSWORD = password;

  return async () => {
    await db.from('courses').delete().like('name', `%[e2e ${tag}]%`);
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) if (u.email?.includes(`-${tag}@e2e.local`)) await db.auth.admin.deleteUser(u.id);
  };
}
