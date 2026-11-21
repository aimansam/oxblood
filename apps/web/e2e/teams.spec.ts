import { expect, test } from '@playwright/test';
import { adminToken, createDrill, firstScenarioId, signInAsAdmin, uniqueName } from './support';

test('pasted names become accounts with a credentials sheet', async ({ page, request }) => {
  const id = await createDrill(request, uniqueName('E2E names'), await firstScenarioId(request));
  await signInAsAdmin(page);
  await page.goto(`/app/players?drill=${id}`);
  await page.getByRole('tab', { name: 'Paste names' }).click();
  const stamp = Date.now().toString(36);
  await page.getByLabel('Player names').fill(`Ana ${stamp}\nBen ${stamp}\n  \nCara ${stamp}`);
  await page.getByRole('button', { name: 'Create 3 accounts' }).click();
  const sheet = page.getByRole('status', { name: 'New player accounts' });
  await expect(sheet.getByText('3 accounts created and enrolled')).toBeVisible();
  await expect(sheet.getByText(`ana.${stamp}`)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Download CSV' })).toBeVisible();
  await expect(page.getByText('3 / 10 enrolled')).toBeVisible();
});

test('a whole event goes in one paste, each person to their team', async ({ page, request }) => {
  const id = await createDrill(request, uniqueName('E2E one paste'), await firstScenarioId(request));
  const headers = { 'X-Oxblood-Token': await adminToken(request) };
  await request.post(`/api/v2/drills/${id}/teams`, { headers, data: { count: 4 } });
  await signInAsAdmin(page);
  await page.goto(`/app/players?drill=${id}`);
  const stamp = Date.now().toString(36);
  const box = page.getByLabel('Player names');

  // A mistyped team is named before anything is created.
  await box.fill(`Ana ${stamp}, Alpha\nBen ${stamp}, Elpha`);
  await expect(page.getByRole('alert')).toContainText('there is no team called "Elpha"');
  await expect(page.getByRole('button', { name: /Create \d* ?accounts?/ })).toBeDisabled();

  // Names without a team go to the team picked above the box; the rest go where they are told.
  await box.fill(`Ana ${stamp}, Alpha\nBen ${stamp}, bravo\nCara ${stamp}, Charlie\nDan ${stamp}`);
  await expect(page.getByText('4 players (Alpha 2, Bravo 1, Charlie 1)')).toBeVisible();
  await page.getByRole('button', { name: 'Create 4 accounts' }).click();
  const sheet = page.getByRole('status', { name: 'New player accounts' });
  await expect(sheet.getByText('4 accounts created and enrolled')).toBeVisible();
  await expect(sheet.getByText('Each player is asked to choose their own password')).toBeVisible();
  await expect(page.getByText('4 / 10 enrolled')).toBeVisible();

  const teams = (await (await request.get(`/api/v2/drills/${id}/teams`, { headers })).json()).teams as { name: string; member_count: number }[];
  expect(Object.fromEntries(teams.map((t) => [t.name, t.member_count]))).toEqual({ Alpha: 2, Bravo: 1, Charlie: 1, Delta: 0 });

  // Too many for the roster is refused up front.
  await box.fill(Array.from({ length: 7 }, (_, i) => `Extra ${i} ${stamp}`).join('\n'));
  await expect(page.getByText('Only 6 seats left.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create 7 accounts' })).toBeDisabled();
});

test('a generated password must be replaced at first sign-in', async ({ page, request }) => {
  const id = await createDrill(request, uniqueName('E2E first login'), await firstScenarioId(request));
  const headers = { 'X-Oxblood-Token': await adminToken(request) };
  const stamp = Date.now().toString(36);
  const made = await request.post(`/api/v2/drills/${id}/participants/bulk`, { headers, data: { names: [`Pat ${stamp}`], side: 'red' } });
  expect(made.ok()).toBeTruthy();
  const { username, password } = (await made.json()).players[0];

  await page.goto('/app/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/change-password$/);
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();

  // There is no way around it: other pages send the player straight back.
  await page.goto('/app/mission');
  await expect(page).toHaveURL(/\/app\/change-password$/);

  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill('short');
  await expect(page.getByRole('alert')).toContainText('at least 10 characters');
  await page.getByLabel('New password', { exact: true }).fill('My-Own-Passw0rd');
  await page.getByLabel('Repeat the new password').fill('My-Own-Passw0rd');
  await page.getByLabel('Current password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('current password is not correct');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/\/app\/mission$/); // now an ordinary player

  // The handed-out password no longer works; the new one does and needs no further change.
  expect((await request.post('/api/v1/auth/login', { data: { sub: username, password } })).status()).toBe(401);
  const again = await (await request.post('/api/v1/auth/login', { data: { sub: username, password: 'My-Own-Passw0rd' } })).json();
  expect(again.must_change_password).toBe(false);
  expect(again.role).toBe('red');
});
