import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminClient, SupabaseAuthVerifier, SupabaseRepository } from '../src/db/supabase.js';
import { ConflictError } from '../src/db/types.js';

const url = process.env.SUPABASE_URL ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

// Salvaguarda: estos tests crean y borran datos. Solo contra Supabase local.
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url))
  throw new Error(`test:db solo se ejecuta contra Supabase local (SUPABASE_URL=${url || 'vacía'})`);

const db = createAdminClient(url, secret);
const repo = new SupabaseRepository(db);
const auth = new SupabaseAuthVerifier(db);
const tag = randomBytes(4).toString('hex');
const password = `pw-${randomBytes(8).toString('hex')}`;
const createdUsers: string[] = [];

async function newTeacher(name: string) {
  const user = await repo.createTeacher({ email: `${name}-${tag}@test.local`, fullName: name, password });
  createdUsers.push(user.id);
  return user;
}

describe('Supabase (local)', () => {
  let teacherId = '';
  let otherId = '';
  let courseId = '';

  beforeAll(async () => {
    teacherId = (await newTeacher('ana')).id;
    otherId = (await newTeacher('luis')).id;
  });

  afterAll(async () => {
    if (courseId) await db.from('courses').delete().eq('id', courseId);
    for (const id of createdUsers) await db.auth.admin.deleteUser(id);
  });

  it('crea profesores con rol teacher y rechaza duplicados', async () => {
    const teachers = await repo.listTeachers();
    expect(teachers.find((t) => t.id === teacherId)).toMatchObject({ role: 'teacher', fullName: 'ana' });
    await expect(
      repo.createTeacher({ email: `ana-${tag}@test.local`, fullName: 'x', password }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('verifica el access token de un login real y rechaza tokens falsos', async () => {
    const client = createClient(url, publishable, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: `ana-${tag}@test.local`, password });
    expect(error).toBeNull();
    expect(await auth.verify(data.session!.access_token)).toMatchObject({ id: teacherId, role: 'teacher' });
    expect(await auth.verify('no-es-un-jwt')).toBeNull();
  });

  it('cambia la contraseña: la nueva entra, la antigua no; usuario inexistente → false', async () => {
    const user = await newTeacher('marta');
    const client = createClient(url, publishable, { auth: { persistSession: false } });
    const next = `pw-${randomBytes(8).toString('hex')}`;
    expect(await repo.setPassword(user.id, next)).toBe(true);
    expect((await client.auth.signInWithPassword({ email: user.email, password: next })).error).toBeNull();
    expect((await client.auth.signInWithPassword({ email: user.email, password })).error).not.toBeNull();
    expect(await repo.setPassword('00000000-0000-4000-8000-000000000000', next)).toBe(false);
  });

  it('RLS: un usuario autenticado no puede leer ni escribir tablas directamente', async () => {
    const client = createClient(url, publishable, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: `ana-${tag}@test.local`, password });
    const read = await client.from('profiles').select('id');
    expect(read.error ?? read.data).toSatisfy((r: unknown) => r !== null && (!Array.isArray(r) || r.length === 0));
    const escalate = await client.from('profiles').update({ role: 'admin' }).eq('id', teacherId);
    expect(escalate.error).not.toBeNull();
  });

  it('cursos, miembros, sesiones y métricas', async () => {
    const course = await repo.createCourse(
      { name: `Curso ${tag}`, sourceLanguage: 'ca', targetLanguages: ['en', 'es'], teacherIds: [teacherId] },
      teacherId,
    );
    courseId = course.id;
    expect(course).toMatchObject({ sourceLanguage: 'ca', targetLanguages: ['en', 'es'], teacherIds: [teacherId] });

    const teacherView = { id: teacherId, email: '', fullName: '', role: 'teacher' as const };
    const otherView = { ...teacherView, id: otherId };
    expect((await repo.listCourses(teacherView)).map((c) => c.id)).toContain(course.id);
    expect((await repo.listCourses(otherView)).map((c) => c.id)).not.toContain(course.id);

    const updated = await repo.updateCourse(course.id, {
      name: `Curso ${tag} v2`,
      sourceLanguage: 'ca',
      targetLanguages: ['fr'],
      teacherIds: [otherId],
    });
    expect(updated).toMatchObject({ targetLanguages: ['fr'], teacherIds: [otherId] });

    const sessionId = `t-${tag}`;
    await repo.createSession({
      id: sessionId,
      courseId: course.id,
      teacherId: otherId,
      sourceLanguage: 'ca',
      targetLanguages: ['fr'],
    });
    await repo.updateSessionStatus(sessionId, 'live');
    await repo.updateSessionStatus(sessionId, 'ended');
    await repo.saveSessionMetrics(sessionId, {
      durationSeconds: 60,
      audioSeconds: 58.5,
      segments: 10,
      translations: 10,
      charsTranslated: 500,
      latencyMedianMs: 900,
      latencyP95Ms: 1500,
      providerErrors: 0,
      sttReconnects: 0,
      peakStudents: 3,
      languagesUsed: ['fr'],
    });
    const row = await db.from('sessions').select('status, started_at, ended_at, session_metrics(segments)').eq('id', sessionId).single();
    expect(row.data).toMatchObject({ status: 'ended', session_metrics: { segments: 10 } });
    expect(row.data?.started_at).not.toBeNull();
    expect(row.data?.ended_at).not.toBeNull();
  });
});
