import { test, expect } from '@playwright/test';

test('ordinary user sees scheduling and technician links inside technical assistance', async ({ page, context }) => {
  await context.addCookies([{ name: 'm8-access', value: 'invalid-test-session', domain: 'localhost', path: '/' }]);
  await page.route('**/api/activity', route => route.fulfill({ json: { admin: false } }));
  await page.goto('/modulos/assistencia-tecnica');
  await expect(page.getByRole('link', { name: 'Portal do técnico', exact: true })).toHaveAttribute('href', '/tecnico?module=assistencia-tecnica');
  await expect(page.getByRole('link', { name: 'Programação de OSs', exact: true })).toHaveAttribute('href', '/programacao?module=assistencia-tecnica');
  await expect(page.getByRole('link', { name: 'Administração', exact: true })).toHaveCount(0);
});

test('ordinary user opens both pages without an admin redirect or header crash', async ({ page, context }) => {
  await context.addCookies([{ name: 'm8-access', value: 'invalid-test-session', domain: 'localhost', path: '/' }]);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/activity', route => route.fulfill({ json: { admin: false } }));
  await page.route('**/api/service-scheduling', route => route.fulfill({ json: { schedules: [], users: [], canEditSettings: false, settings: {document:{calendars:[],serviceTypes:[],vehicles:[]}}, email: 'user@test.com' } }));
  await page.route('**/api/field', route => route.fulfill({ json: {rows:[],calendarRows:[],active:null,email:'user@test.com',isTechnician:false} }));
  await page.goto('/programacao');
  await expect(page).toHaveURL(/\/programacao$/);
  await expect(page.getByRole('heading', {name:'Programação de OSs',exact:true})).toBeVisible();
  await page.goto('/tecnico');
  await expect(page).toHaveURL(/\/tecnico$/);
  await page.getByRole('button', {name:'Programação OSs, peças e apontamentos'}).click();
  await expect(page.getByRole('button', {name:'Atualizar',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
