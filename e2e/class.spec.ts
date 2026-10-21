import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { adminDb, adminEmail, courseName, createTeacher, login, trackCspViolations, unique, userEmail } from './helpers';

// Frases del STT mock (apps/api/src/providers/mock.ts), en orden.
const PHRASE_1 = 'Bienvenidos a la sesión de hoy.';
const PHRASE_2 = 'Antes de usar la máquina, comprobad los sistemas de seguridad.';

const subtitles = (page: Page) => page.locator('.subtitles');

test('clase completa: admin prepara curso, profesor emite y alumnos reciben subtítulos traducidos', async ({
  browser,
}, testInfo) => {
  const cspViolations: string[] = [];
  const newContext = async () => {
    const ctx = await browser.newContext();
    trackCspViolations(ctx, cspViolations);
    return ctx;
  };
  const teacherName = unique('Profe E2E ');
  const teacherEmail = userEmail(unique('profe'));
  const course = courseName(unique('Seguridad en taller '));

  // ---------- Admin: crea profesor y curso desde la UI (FR-01) ----------
  const adminCtx = await newContext();
  const admin = await adminCtx.newPage();
  await login(admin, adminEmail());
  await admin.getByRole('link', { name: 'Administración' }).click();
  await expect(admin).toHaveURL(/\/admin\/cursos$/);

  // Profesores: página propia; el alta se hace en un modal.
  await admin.getByRole('link', { name: 'Profesores', exact: true }).click();
  await admin.getByRole('button', { name: 'Nuevo profesor' }).click();
  const modal = admin.getByRole('dialog', { name: 'Nuevo profesor' });
  await modal.getByLabel('Nombre', { exact: true }).fill(teacherName);
  await modal.getByLabel('Email').fill(teacherEmail);
  await modal.getByLabel('Contraseña inicial').fill(process.env.E2E_PASSWORD!);
  await modal.getByRole('button', { name: 'Crear profesor' }).click();
  await expect(modal).toBeHidden();
  const alert = admin.getByRole('dialog', { name: 'Profesor creado correctamente' });
  await expect(alert).toContainText(teacherEmail);
  await alert.getByRole('button', { name: 'Aceptar' }).click();
  await expect(alert).toBeHidden();
  await expect(admin.locator('.user-list')).toContainText(teacherEmail);

  await admin.getByRole('link', { name: 'Cursos', exact: true }).click();
  await admin.getByRole('button', { name: 'Nuevo curso' }).click();
  await admin.getByLabel('Nombre del curso').fill(course);
  await expect(admin.getByLabel('Idioma del profesor')).toHaveValue('es');
  await admin.getByLabel(teacherName).check();
  await admin.getByRole('button', { name: 'Crear curso' }).click();
  await admin.getByRole('dialog', { name: 'Curso creado correctamente' }).getByRole('button', { name: 'Aceptar' }).click();
  const card = admin.locator('article', { hasText: course });
  await expect(card).toContainText('Castellano → English, Français');
  await expect(card).toContainText(`Profesores: ${teacherName}`);
  await adminCtx.close();

  // ---------- Profesor: prepara la clase (OBJ-04) ----------
  const teacherCtx = await newContext();
  const teacher = await teacherCtx.newPage();
  await login(teacher, teacherEmail);
  await teacher.locator('article', { hasText: course }).getByRole('button', { name: 'Preparar clase' }).click();
  await expect(teacher).toHaveURL(/\/t\/[\w-]+$/);
  const sessionId = teacher.url().split('/t/')[1]!;
  await expect(teacher.locator('.status')).toHaveText('Preparada');
  const studentUrl = await teacher.locator('a.url').getAttribute('href');
  expect(studentUrl).toContain(`/s/${sessionId}`);

  // ---------- Alumnos: entran sin cuenta y eligen idioma (AC-03, AC-04) ----------
  const enCtx = await newContext();
  const en = await enCtx.newPage();
  // Proxy del WebSocket del alumno para poder cortar la conexión más adelante (AC-08).
  let enSocket: { page: WebSocketRoute; server: WebSocketRoute } | undefined;
  await en.routeWebSocket(/\/ws\/student\//, (ws) => {
    enSocket = { page: ws, server: ws.connectToServer() };
  });
  await en.goto(studentUrl!);
  await en.getByRole('button', { name: 'English' }).click();
  await expect(en.getByText('La clase aún no ha empezado.')).toBeVisible();

  const frCtx = await newContext();
  const fr = await frCtx.newPage();
  await fr.goto(studentUrl!);
  await fr.getByRole('button', { name: 'Français' }).click();

  await expect(teacher.locator('.big-number')).toHaveText('2');

  // ---------- En directo: micrófono simulado → STT mock → traducción (AC-01, AC-02, AC-06) ----------
  await teacher.getByRole('button', { name: 'Iniciar clase' }).click();
  await expect(teacher.locator('.status')).toHaveText('En directo');
  await expect(teacher.locator('.health li', { hasText: 'Audio' })).toHaveClass(/health-ok/);
  await expect(teacher.locator('.transcript')).toContainText(PHRASE_1);

  await expect(subtitles(en)).toContainText(`[en] ${PHRASE_1}`);
  await expect(subtitles(fr)).toContainText(`[fr] ${PHRASE_1}`);
  await expect(en.getByText('La clase aún no ha empezado.')).toBeHidden();

  // ---------- Otro profesor no puede abrir este panel ----------
  const other = await createTeacher('intruso');
  const otherCtx = await newContext();
  const otherPage = await otherCtx.newPage();
  await login(otherPage, other.email);
  await otherPage.goto(`/t/${sessionId}`);
  await expect(otherPage.getByText('No tienes permiso para controlar esta sesión')).toBeVisible();
  await otherCtx.close();

  // ---------- Reconexión del alumno con recuperación del buffer (AC-08) ----------
  expect(enSocket).toBeDefined();
  const dropped = enSocket!;
  await dropped.server.close();
  await dropped.page.close({ code: 4000, reason: 'e2e drop' });
  await expect(en.getByText('Reconectando…')).toBeVisible();
  await expect(en.getByText('Reconectando…')).toBeHidden();
  expect(enSocket).not.toBe(dropped);
  await expect(subtitles(en)).toContainText(`[en] ${PHRASE_2}`);
  // Sin duplicados tras recuperar el buffer con `since`.
  await expect(subtitles(en).getByText(`[en] ${PHRASE_1}`)).toHaveCount(1);

  // ---------- Pausa y reanudación en la misma sala (AC-07) ----------
  await teacher.getByRole('button', { name: 'Pausar' }).click();
  await expect(teacher.locator('.status')).toHaveText('Pausada');
  await expect(en.getByText('Clase en pausa.')).toBeVisible();
  await expect(fr.getByText('Clase en pausa.')).toBeVisible();
  await teacher.getByRole('button', { name: 'Reanudar' }).click();
  await expect(teacher.locator('.status')).toHaveText('En directo');
  await expect(en.getByText('Clase en pausa.')).toBeHidden();

  // ---------- Cambio de idioma en directo (FR-10) ----------
  await fr.getByLabel('Idioma').selectOption('en');
  await expect(subtitles(fr)).toContainText(`[en] ${PHRASE_1}`);
  await expect(subtitles(fr)).not.toContainText('[fr]');

  // ---------- Finalizar (AC-10) ----------
  await teacher.getByRole('button', { name: 'Finalizar' }).click();
  await teacher.getByRole('button', { name: 'Confirmar finalizar' }).click();
  await expect(teacher.locator('.status')).toHaveText('Finalizada');
  await expect(en.getByText('La clase ha finalizado.')).toBeVisible();
  await expect(fr.getByText('La clase ha finalizado.')).toBeVisible();

  // ---------- Persistencia: estado y métricas sin texto (AC-11) ----------
  await expect
    .poll(async () => {
      const { data } = await adminDb()
        .from('sessions')
        .select('status, started_at, session_metrics(peak_students, segments, languages_used)')
        .eq('id', sessionId)
        .single();
      return data;
    })
    .toMatchObject({
      status: 'ended',
      session_metrics: { peak_students: 2, languages_used: expect.arrayContaining(['en', 'fr']) },
    });

  // Build de producción: la CSP está activa y no ha bloqueado nada (audio worklet, API, WS, Supabase).
  if (testInfo.project.name === 'build')
    expect(await teacher.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);
  expect(cspViolations).toEqual([]);

  await Promise.all([teacherCtx.close(), enCtx.close(), frCtx.close()]);
});
