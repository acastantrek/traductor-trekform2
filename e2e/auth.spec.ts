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
