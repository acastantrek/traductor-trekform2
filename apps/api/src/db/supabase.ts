import type {
  Course,
  CourseInput,
  CreateTeacherRequest,
  Language,
  SessionStatus,
  SourceLanguage,
  TeacherSummary,
  UpdateTeacherRequest,
} from '@ct/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ConflictError,
  type AuthUser,
  type AuthVerifier,
  type Repository,
  type SessionMetrics,
  type SessionRow,
} from './types.js';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: 'teacher' | 'admin';
}

interface CourseRow {
  id: string;
  name: string;
  source_language: SourceLanguage;
  created_at: string;
  course_members: { user_id: string }[];
}

const COURSE_COLUMNS = 'id, name, source_language, created_at, course_members(user_id)';

const toUser = (p: ProfileRow): AuthUser => ({
  id: p.id,
  email: p.email,
  fullName: p.full_name,
  role: p.role,
});

const toCourse = (c: CourseRow): Course => ({
  id: c.id,
  name: c.name,
  sourceLanguage: c.source_language,
  teacherIds: c.course_members.map((m) => m.user_id),
  createdAt: c.created_at,
});

type Result<T> = { data: T; error: { message: string; code?: string } | null };

function ok<T>(result: Result<T>): T {
  if (result.error) {
    if (result.error.code === '23505') throw new ConflictError(result.error.message);
    throw new Error(`Supabase: ${result.error.message}`);
  }
  return result.data;
}

/** Para consultas con `select`: la respuesta no puede ser nula. */
function check<T>(result: Result<T>): NonNullable<T> {
  const data = ok(result);
  if (data === null || data === undefined) throw new Error('Supabase: respuesta vacía');
  return data;
}

export function createAdminClient(url: string, secretKey: string) {
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Valida el token contra Supabase Auth (respeta revocaciones) y carga el rol desde `profiles`. */
export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(private db: SupabaseClient) {}

  async verify(accessToken: string): Promise<AuthUser | null> {
    if (!accessToken) return null;
    const { data, error } = await this.db.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const profile = await this.db
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', data.user.id)
      .maybeSingle<ProfileRow>();
    return profile.data ? toUser(profile.data) : null;
  }
}

export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient) {}

  async listTeachers() {
    const rows = check(
      await this.db.from('profiles').select('id, email, full_name, role').order('full_name').returns<ProfileRow[]>(),
    );
    return rows.map(toUser);
  }

  async createTeacher(input: CreateTeacherRequest): Promise<TeacherSummary> {
    const { data, error } = await this.db.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (error || !data.user) {
      if (error && (error.status === 422 || /already/i.test(error.message)))
        throw new ConflictError('Ya existe un usuario con ese email');
      throw new Error(`Supabase Auth: ${error?.message ?? 'sin usuario'}`);
    }
    return { id: data.user.id, email: input.email, fullName: input.fullName, role: 'teacher' };
  }

  private async isTeacher(id: string) {
    const rows = check(await this.db.from('profiles').select('id').eq('id', id).eq('role', 'teacher'));
    return rows.length > 0;
  }

  async updateTeacher(id: string, input: UpdateTeacherRequest): Promise<TeacherSummary | null> {
    if (!(await this.isTeacher(id))) return null;
    const { error } = await this.db.auth.admin.updateUserById(id, {
      email: input.email,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (error) {
      if (error.status === 422 || /already/i.test(error.message)) throw new ConflictError('Ya existe un usuario con ese email');
      throw new Error(`Supabase Auth: ${error.message}`);
    }
    // El trigger solo copia los datos al crear: el perfil se actualiza aparte.
    ok(await this.db.from('profiles').update({ email: input.email, full_name: input.fullName }).eq('id', id));
    return { id, email: input.email, fullName: input.fullName, role: 'teacher' };
  }

  async deleteTeacher(id: string) {
    if (!(await this.isTeacher(id))) return false;
    // profiles → course_members y sessions → session_metrics caen en cascada.
    const { error } = await this.db.auth.admin.deleteUser(id);
    if (error) throw new Error(`Supabase Auth: ${error.message}`);
    return true;
  }

  async setPassword(userId: string, password: string) {
    const { error } = await this.db.auth.admin.updateUserById(userId, { password });
    if (!error) return true;
    if (error.status === 404 || /not found/i.test(error.message)) return false;
    throw new Error(`Supabase Auth: ${error.message}`);
  }

  async listCourses(user: AuthUser) {
    let query = this.db.from('courses').select(COURSE_COLUMNS).order('created_at', { ascending: false });
    if (user.role !== 'admin') {
      const memberships = check(await this.db.from('course_members').select('course_id').eq('user_id', user.id));
      const ids = (memberships as { course_id: string }[]).map((m) => m.course_id);
      if (!ids.length) return [];
      query = query.in('id', ids);
    }
    return check(await query.returns<CourseRow[]>()).map(toCourse);
  }

  async getCourse(id: string) {
    const row = ok(await this.db.from('courses').select(COURSE_COLUMNS).eq('id', id).maybeSingle<CourseRow>());
    return row ? toCourse(row) : null;
  }

  async createCourse(input: CourseInput, createdBy: string) {
    const row = check(
      await this.db
        .from('courses')
        .insert({
          name: input.name,
          source_language: input.sourceLanguage,
          created_by: createdBy,
        })
        .select('id')
        .single<{ id: string }>(),
    );
    await this.setMembers(row.id, input.teacherIds);
    return (await this.getCourse(row.id))!;
  }

  async updateCourse(id: string, input: CourseInput) {
    const updated = check(
      await this.db
        .from('courses')
        .update({
          name: input.name,
          source_language: input.sourceLanguage,
        })
        .eq('id', id)
        .select('id'),
    );
    if (!updated.length) return null;
    await this.setMembers(id, input.teacherIds);
    return this.getCourse(id);
  }

  async deleteCourse(id: string) {
    const deleted = check(await this.db.from('courses').delete().eq('id', id).select('id'));
    return deleted.length > 0;
  }

  private async setMembers(courseId: string, teacherIds: string[]) {
    const current = check(await this.db.from('course_members').select('user_id').eq('course_id', courseId)) as {
      user_id: string;
    }[];
    const remove = current.map((m) => m.user_id).filter((id) => !teacherIds.includes(id));
    if (remove.length)
      ok(await this.db.from('course_members').delete().eq('course_id', courseId).in('user_id', remove));
    if (teacherIds.length)
      ok(
        await this.db
          .from('course_members')
          .upsert(
            teacherIds.map((user_id) => ({ course_id: courseId, user_id })),
            { onConflict: 'course_id,user_id', ignoreDuplicates: true },
          ),
      );
  }

  async createSession(row: SessionRow) {
    ok(
      await this.db.from('sessions').insert({
        id: row.id,
        course_id: row.courseId,
        teacher_id: row.teacherId,
        source_language: row.sourceLanguage,
        target_languages: row.targetLanguages,
      }),
    );
  }

  async updateSessionStatus(id: string, status: SessionStatus) {
    const now = new Date().toISOString();
    const patch: Record<string, string> = { status };
    if (status === 'ended') patch.ended_at = now;
    ok(await this.db.from('sessions').update(patch).eq('id', id));
    if (status === 'live')
      ok(await this.db.from('sessions').update({ started_at: now }).eq('id', id).is('started_at', null));
  }

  async saveSessionMetrics(id: string, m: SessionMetrics) {
    ok(
      await this.db.from('session_metrics').upsert({
        session_id: id,
        duration_seconds: m.durationSeconds,
        audio_seconds: m.audioSeconds,
        segments: m.segments,
        translations: m.translations,
        chars_translated: m.charsTranslated,
        latency_median_ms: m.latencyMedianMs,
        latency_p95_ms: m.latencyP95Ms,
        provider_errors: m.providerErrors,
        stt_reconnects: m.sttReconnects,
        peak_students: m.peakStudents,
        languages_used: m.languagesUsed,
      }),
    );
  }

  async closeOrphanSessions() {
    const rows = check(
      await this.db
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .neq('status', 'ended')
        .select('id'),
    );
    return rows.length;
  }
}
