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
