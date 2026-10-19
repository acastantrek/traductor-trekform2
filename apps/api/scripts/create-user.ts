// Crea un usuario de Supabase Auth (registro público desactivado).
// Uso: npm run user:create -w @ct/api -- --email a@b.c --password 'xxxxxxxx' --name 'Nombre' [--admin]
import { parseArgs } from 'node:util';
import { createAdminClient, SupabaseRepository } from '../src/db/supabase.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: '' },
    admin: { type: 'boolean', default: false },
  },
});

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY');
if (!values.email || !values.password || values.password.length < 8)
  throw new Error('Indica --email y --password (mínimo 8 caracteres)');

const db = createAdminClient(url, key);
const user = await new SupabaseRepository(db).createTeacher({
  email: values.email.toLowerCase(),
  password: values.password,
  fullName: values.name || values.email,
});
if (values.admin) {
  const { error } = await db.from('profiles').update({ role: 'admin' }).eq('id', user.id);
  if (error) throw new Error(error.message);
}
console.log(`Usuario creado: ${user.email} (${values.admin ? 'admin' : 'teacher'})`);
