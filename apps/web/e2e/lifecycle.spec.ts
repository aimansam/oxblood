import { expect, test } from '@playwright/test';
import { adminToken, createPlayer, enroll, signIn, signInAsAdmin, uniqueName } from './support';

test('play a whole exercise: prepare, start, a player scores from the map, pause, resume, stop', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  const watch = (who: string, page: import('@playwright/test').Page) => {
    page.on('pageerror', (e) => problems.push(`[${who}] pageerror: ${e.message}`));
    page.on('response', (r) => r.status() >= 500 && problems.push(`[${who}] http ${r.status()} ${r.request().method()} ${r.url()}`));
  };

  const headers = { 'X-Divide-Token': await adminToken(request) };
  const scenarios = (await (await request.get('/api/v1/scenarios')).json()).items as { id: number; name: string }[];
  const scenario = scenarios.find((s) => s.name === 'enterprise-file-breach') ?? scenarios[0];
  const title = uniqueName('Lifecycle');
  const made = await request.post('/api/v2/drills', { headers, data: { title, drill_type: 'individual', duration_limit_minutes: 60, max_participants: 10, scenario_id: scenario.id } });
  const id = (await made.json()).drill_id as number;
  const red = await createPlayer(request, 'red');
  const blue = await createPlayer(request, 'blue');
  await enroll(request, id, red.id, 'red');
  await enroll(request, id, blue.id, 'blue');

  const operatorCtx = await browser.newContext();
  const operator = await operatorCtx.newPage();
  watch('operator', operator);
  try {
    await signInAsAdmin(operator);
    await operator.goto(`/app/exercises?drill=${id}`);
    await operator.getByRole('button', { name: 'Prepare range' }).click();
    await expect(operator.getByText('Range: started')).toBeVisible({ timeout: 45_000 });
    await operator.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(operator.getByText('Live', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await operator.getByRole('link', { name: 'Open live range' }).click();
    await expect(operator).toHaveURL(new RegExp(`/app/live/${id}`));
    await expect(operator.getByLabel('Submit a flag')).toHaveCount(0); // operators do not submit flags

    // The player enters the map; the flag form must be on top of it, not buried under the map layer.
    const playerCtx = await browser.newContext();
    const player = await playerCtx.newPage();
    watch('player', player);
    await signIn(player, red);
    await expect(player).toHaveURL(/\/app\/mission$/);
    await player.getByRole('link', { name: 'Enter the map' }).click();
    await expect(player).toHaveURL(new RegExp(`/app/live/${id}`));
    const mission = player.getByRole('region', { name: 'Mission' });
    await expect(mission).toBeVisible();
    await expect(mission.getByText('Objectives')).toBeVisible();
    const flagBox = player.getByLabel('Flag', { exact: true });
    await expect(flagBox).toBeVisible();
    await flagBox.fill('FLAG{enterprise_dmz_foothold}');
    await player.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(player.getByText(/First blood! \+\d+ pts/)).toBeVisible({ timeout: 8_000 });
    await playerCtx.close();

    await operator.goto(`/app/exercises?drill=${id}`);
    await operator.getByRole('button', { name: 'Pause' }).click();
    await expect(operator.getByText('Paused', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await operator.getByRole('button', { name: 'Resume' }).click();
    await expect(operator.getByText('Live', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await operator.getByRole('button', { name: 'Stop', exact: true }).click();
    const confirm = operator.getByRole('dialog');
    if (await confirm.count()) await confirm.getByRole('button', { name: /Stop|Confirm|Yes/ }).last().click();
    await expect(operator.getByText('Completed', { exact: true }).first()).toBeVisible({ timeout: 45_000 });
  } finally {
    // Free the shared environment for the other tests whatever happened above.
    await request.post(`/api/v2/drills/${id}/stop`, { headers });
    await operatorCtx.close();
  }
  expect(problems).toEqual([]);
});

test('the wizard prepares a range and "Open live range" takes the operator into it', async ({ page, request }) => {
  const title = uniqueName('Wizard live');
  const headers = { 'X-Divide-Token': await adminToken(request) };
  await signInAsAdmin(page);
  await page.goto('/app/exercises');
  await page.getByRole('button', { name: 'New exercise' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Prepare range' }).click();
  await page.getByRole('button', { name: /Prepare|Create/ }).last().click(); // "not start-ready, prepare anyway?"
  try {
    const open = dialog.getByRole('button', { name: 'Open live range' });
    await expect(open).toBeEnabled({ timeout: 45_000 });
    await open.click();
    await expect(page).toHaveURL(/\/app\/live\/\d+$/);
    await expect(page.getByLabel('Back to exercises')).toBeVisible();
  } finally {
    const list = await (await request.get('/api/v2/drills', { headers })).json();
    for (const d of list.drills.filter((x: { title: string }) => x.title === title)) {
      await request.post(`/api/v2/drills/${d.id}/stop`, { headers });
    }
  }
});


test('the exercise card says why Start would be refused', async ({ page, request }) => {
  const headers = { 'X-Divide-Token': await adminToken(request) };
  const scenarios = (await (await request.get('/api/v1/scenarios')).json()).items as { id: number; name: string }[];
  const scenario = scenarios.find((s) => s.name === 'enterprise-file-breach') ?? scenarios[0];
  const title = uniqueName('Blockers');
  const made = await request.post('/api/v2/drills', { headers, data: { title, drill_type: 'individual', duration_limit_minutes: 60, max_participants: 10, scenario_id: scenario.id } });
  const id = (await made.json()).drill_id as number;
  await enroll(request, id, (await createPlayer(request, 'red')).id, 'red'); // no Blue player on purpose
  try {
    await signInAsAdmin(page);
    await page.goto(`/app/exercises?drill=${id}`);
    await page.getByRole('button', { name: 'Prepare range' }).click();
    await expect(page.getByText('Range: started')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Start will be refused until:')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Blue/)).toBeVisible();
  } finally {
    await request.post(`/api/v2/drills/${id}/stop`, { headers });
  }
});
