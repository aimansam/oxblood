import { expect, test } from '@playwright/test';
import { adminToken, createDrill, firstScenarioId, signInAsAdmin, uniqueName } from './support';

test('operators create and revoke invitation links', async ({ page, request }) => {
  const id = await createDrill(request, uniqueName('E2E teams'), await firstScenarioId(request));
  await signInAsAdmin(page);
  await page.goto(`/app/players?drill=${id}`);
  await expect(page.getByText('Start needs a Red player and a Blue player.')).toBeVisible();
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Link ready: Red · 1 seat')).toBeVisible();
  await expect(page.getByLabel('Participant invitation link')).toHaveValue(/\/join#token=[\w-]{43}$/);
  await expect(page.getByText('Open links (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Link revoked')).toBeVisible();
});

test('one team link enrolls the whole team, then is used up', async ({ page, request, browser }) => {
  const id = await createDrill(request, uniqueName('E2E team link'), await firstScenarioId(request));
  const headers = { 'X-Divide-Token': await adminToken(request) };
  await request.post(`/api/v2/drills/${id}/teams`, { headers, data: { count: 2 } });
  await signInAsAdmin(page);
  await page.goto(`/app/players?drill=${id}`);
  await page.getByLabel('Seats', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Link ready: Alpha · 3 seats')).toBeVisible();
  const url = await page.getByLabel('Participant invitation link').inputValue();
  const token = url.split('token=')[1];

  // The link shows who it is for before anyone registers.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/join#token=${token}`);
  await expect(guest.getByText('ALPHA')).toBeVisible();
  await guest.close();

  const join = (name: string) => request.post('/api/v2/invitations/redeem', { data: { token, username: name, password: 'Invitee12345!' } });
  const stamp = Date.now().toString(36);
  for (const n of ['a', 'b', 'c']) expect((await join(`mate${n}${stamp}`)).status()).toBe(201);
  expect((await join(`late${stamp}`)).status()).toBe(404); // used up

  await page.reload();
  await expect(page.getByText('3 / 10 enrolled')).toBeVisible();
  await expect(page.getByText('Open links')).toHaveCount(0); // the used-up link is gone from the list
  await expect(page.getByText('3 players')).toBeVisible(); // all three are in Alpha
});

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

test('an invited player registers once and lands on their mission screen', async ({ page, context, request }) => {
  const id = await createDrill(request, uniqueName('E2E invite'), await firstScenarioId(request));
  const token = await adminToken(request);
  const invite = await (await request.post(`/api/v2/drills/${id}/invitations`, { headers: { 'X-Divide-Token': token }, data: { side: 'blue' } })).json();

  // The secret is in the fragment, and survives the /join -> /app/join redirect.
  await page.goto(`/join#token=${invite.token}`);
  await expect(page).toHaveURL(/\/app\/join#token=/);
  await expect(page.getByText('BLUE TEAM')).toBeVisible();
  const name = `invitee${Date.now().toString(36)}`;
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill('Invitee12345!');
  await page.getByRole('button', { name: 'Create account & join' }).click();
  await expect(page).toHaveURL(/\/app\/mission$/);
  expect(page.url()).not.toContain('token=');

  // Single use.
  const second = await context.newPage();
  await second.goto(`/join#token=${invite.token}`);
  await expect(second.getByText('Link unavailable')).toBeVisible();
});

test('a missing or malformed token is unavailable', async ({ page }) => {
  await page.goto('/app/join');
  await expect(page.getByText('Link unavailable')).toBeVisible();
  await page.goto('/app/join#token=short');
  await expect(page.getByText('Link unavailable')).toBeVisible();
});
