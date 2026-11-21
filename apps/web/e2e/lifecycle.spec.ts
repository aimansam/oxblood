import { expect, test } from '@playwright/test';
import { adminToken, createPlayer, enroll, signIn, signInAsAdmin, uniqueName } from './support';

test('play a whole exercise: prepare, start, a player scores from the map, pause, resume, stop', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  const watch = (who: string, page: import('@playwright/test').Page) => {
    page.on('pageerror', (e) => problems.push(`[${who}] pageerror: ${e.message}`));
    page.on('response', (r) => r.status() >= 500 && problems.push(`[${who}] http ${r.status()} ${r.request().method()} ${r.url()}`));
  };

  const headers = { 'X-Oxblood-Token': await adminToken(request) };
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
    // A red player sees only the red side: the other zones are marked, not drawn empty.
    await expect(player.getByText('Not visible to your team').first()).toBeVisible();
    await expect(player.locator('.rm-node')).toHaveCount(1);
    const mission = player.getByRole('region', { name: 'Mission' });
    await expect(mission).toBeVisible();
    await expect(mission.getByText('Objectives')).toBeVisible();
    await expect(mission.getByText(/blue console/i)).toHaveCount(0); // a red player sees only red objectives
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
  const headers = { 'X-Oxblood-Token': await adminToken(request) };
  await signInAsAdmin(page);
  await page.goto('/app/exercises');
  await page.getByRole('button', { name: 'New exercise' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click(); // Format
  await dialog.getByRole('button', { name: 'Next' }).click(); // Setup -> Snapshots
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


test('the exercise card says why Start is refused and can add test players', async ({ page, request }) => {
  const headers = { 'X-Oxblood-Token': await adminToken(request) };
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
    // Starting now explains instead of failing with a bare 409 ...
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText(/Cannot start yet/)).toBeVisible();
    // ... and the card points at the Players screen, where one click adds test players.
    await page.getByRole('link', { name: 'Add players' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/players\\?drill=${id}`));
    await expect(page.getByText('Start needs a Blue player.')).toBeVisible();
    await page.getByRole('tab', { name: 'Test players' }).click();
    await page.getByRole('button', { name: 'Add test players' }).click();
    await expect(page.getByRole('status', { name: 'New player accounts' }).getByText(/test\.blue\./).first()).toBeVisible();
    await expect(page.getByText('The roster has both sides, so the exercise can start.')).toBeVisible();
    await page.goto(`/app/exercises?drill=${id}`);
    await expect(page.getByText('Start will be refused until:')).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText('Live', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await request.post(`/api/v2/drills/${id}/stop`, { headers });
  }
});


test('a team competition is set up in the wizard, players join while the range builds, and the accounts are destroyed after cleanup', async ({ page, request }) => {
  test.setTimeout(120_000);
  const title = uniqueName('Wizard teams');
  const headers = { 'X-Oxblood-Token': await adminToken(request) };
  await signInAsAdmin(page);
  await page.goto('/app/exercises');
  await page.getByRole('button', { name: 'New exercise' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Max participants').fill('8');
  await dialog.getByRole('button', { name: 'Next' }).click();

  // Format: a team competition with 4 teams. This scenario's router cannot make copies, so one range per
  // match is offered but not selectable, with the reason.
  await dialog.getByRole('button', { name: /Team competition/ }).click();
  await expect(dialog.getByText('About 2 players each')).toBeVisible(); // 4 teams is the default; 8 seats
  await expect(dialog.locator('option:disabled')).toContainText('not possible for this scenario');
  await expect(dialog.getByText(/OPNsense/)).toBeVisible();
  await expect(dialog.getByText(/Destroy the accounts made for this exercise/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click(); // Setup -> Snapshots
  await dialog.getByRole('button', { name: 'Prepare range' }).click();
  await page.getByRole('button', { name: /Prepare|Create/ }).last().click();

  // While the range builds: accounts from pasted names, each to their team.
  const players = dialog.getByRole('region', { name: 'Add players while the range builds' });
  await expect(players).toBeVisible();
  await expect(dialog.getByText('Provision run #')).toBeVisible({ timeout: 45_000 });
  const stamp = Date.now().toString(36);
  await players.getByLabel('Player names').fill(`Zed ${stamp}, Alpha\nYan ${stamp}, Bravo`);
  await players.getByRole('button', { name: 'Create 2 accounts' }).click();
  await expect(players.getByRole('status', { name: 'New player accounts' }).getByText(`zed.${stamp}`)).toBeVisible();
  await expect(players.getByText('2 / 8 enrolled')).toBeVisible();

  // The format landed before the range was prepared.
  const list = await (await request.get('/api/v2/drills', { headers })).json();
  const drill = list.drills.find((d: { title: string }) => d.title === title);
  expect(drill.drill_type).toBe('team');
  expect((await (await request.get(`/api/v2/drills/${drill.id}/teams`, { headers })).json()).teams).toHaveLength(4);
  expect((await (await request.get(`/api/v2/drills/${drill.id}/rounds`, { headers })).json()).rounds).toHaveLength(2);

  // Cleaning up the range destroys the accounts made for it, and keeps a final roster.
  const usersBefore = JSON.stringify(await (await request.get('/api/v1/auth/users', { headers })).json());
  expect(usersBefore).toContain(`zed.${stamp}`);
  expect((await request.post(`/api/v2/drills/${drill.id}/stop`, { headers })).ok()).toBeTruthy();
  const usersAfter = JSON.stringify(await (await request.get('/api/v1/auth/users', { headers })).json());
  expect(usersAfter).not.toContain(`zed.${stamp}`);
  expect(usersAfter).not.toContain(`yan.${stamp}`);
  const after = await (await request.get(`/api/v2/drills/${drill.id}`, { headers })).json();
  expect(after.environment_config.final_roster.map((r: { username: string }) => r.username).sort()).toEqual([`yan.${stamp}`, `zed.${stamp}`]);
});
