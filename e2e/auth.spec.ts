import { expect, test } from '@playwright/test';
import { adminEmail, createTeacher, login } from './helpers';

test('sin sesión, las rutas de profesor redirigen al login', async ({ page }) => {
  for (const path of ['/', '/admin', '/t/abc']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('contraseña incorrecta muestra un error claro', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail());
  await page.getByLabel('Contraseña').fill('no-es-la-buena');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos');
});

test('un profesor no ve administración ni puede entrar en /admin', async ({ page }) => {
  const teacher = await createTeacher('sinadmin');
  await login(page, teacher.email);
  await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
  await expect(page.getByText('No tienes cursos asignados.')).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
});

test('el admin solo ve la administración y nunca prepara clases', async ({ page }) => {
  await login(page, adminEmail());
  await expect(page).toHaveURL(/\/admin\/cursos$/);
  await expect(page.getByRole('link', { name: 'Mis cursos' })).toHaveCount(0);
  for (const path of ['/', '/t/abc']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/cursos$/);
  }
});

test('salir cierra la sesión', async ({ page }) => {
  await login(page, adminEmail());
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('alumno: una sala inexistente muestra un mensaje en vez de fallar', async ({ page }) => {
  await page.goto('/s/no-existe');
  await expect(page.getByText('Esta clase no existe o ya ha caducado.')).toBeVisible();
});

test('alumno: no descarga la zona de profesores ni contacta con Supabase', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'build', 'Los chunks solo existen en el build');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/s/no-existe');
  await expect(page.getByText('Esta clase no existe o ya ha caducado.')).toBeVisible();
  expect(requests.filter((u) => /StaffApp|supabase|:55621/i.test(u))).toEqual([]);
});
