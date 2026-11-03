import { expect, test } from '@playwright/test';
import { createDrill, firstScenarioId, signInAsAdmin, uniqueName } from './support';

test('the live range map: inspect, layers, zoom, pan, fit, story feed, keyboard', async ({ page, request }) => {
  const id = await createDrill(request, uniqueName('E2E map'), await firstScenarioId(request));
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await signInAsAdmin(page);
  await page.goto(`/app/live/${id}`);

  const svg = page.locator('svg.rm-svg');
  const viewBox = async () => (await svg.getAttribute('viewBox')) ?? '';
  await expect(page.locator('.rm-node').first()).toBeVisible();
  const full = await viewBox();
  expect(await page.locator('.rm-node').count()).toBeGreaterThan(2);

  // Inspect a machine (and close it again).
  await page.getByRole('button', { name: 'Inspect red workstation' }).click();
  const details = page.getByRole('complementary', { name: 'Details' });
  await expect(details.getByText('Node inspection')).toBeVisible();
  await expect(details.getByRole('heading', { name: 'red workstation' })).toBeVisible();
  await details.getByRole('button', { name: 'Close details' }).click();
  await expect(details).toHaveCount(0);

  // Inspect a link, then jump to one of its machines from the link panel.
  await page.getByRole('button', { name: /Inspect red_vlan link/ }).dispatchEvent('click');
  await expect(details.getByText('Link inspection')).toBeVisible();
  await details.getByRole('button').filter({ hasText: /red workstation/i }).first().click();
  await expect(details.getByText('Node inspection')).toBeVisible();

  // Layers dim what they are not about.
  await page.getByRole('button', { name: 'Threat path' }).click();
  await expect(page.locator('.rm')).toHaveAttribute('data-filter', 'red');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.rm')).toHaveAttribute('data-filter', 'all');

  // Zoom buttons (also the keyboard route), then fit, wheel zoom, drag pan.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(viewBox).not.toBe(full);
  await page.getByRole('button', { name: 'Zoom out' }).click();


  await page.getByRole('button', { name: 'Fit range' }).click();
  await expect.poll(viewBox).toBe(full);
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);
  await expect.poll(viewBox).not.toBe(full);
  const zoomed = await viewBox();
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 360, { steps: 6 });
  await page.mouse.up();
  await expect.poll(viewBox).not.toBe(zoomed);
  await page.getByRole('button', { name: 'Fit range' }).click();
  await expect.poll(viewBox).toBe(full);

  // Flow animation, legend, story feed.
  await page.getByRole('button', { name: 'Play flow' }).click();
  await expect(page.locator('.rm-packet').first()).toBeAttached();
  await page.getByRole('button', { name: 'Pause flow' }).click();
  await expect(page.locator('.rm-packet')).toHaveCount(0);
  await page.getByRole('button', { name: 'VLANs' }).click();
  await expect(page.getByRole('region', { name: 'VLAN legend' })).toBeVisible();
  await page.getByRole('button', { name: 'Story feed' }).click();
  await expect(page.getByRole('region', { name: 'Mission record' })).toBeVisible();

  // Keyboard: a machine opens with Enter.
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Inspect dmz gateway' }).focus();
  await page.keyboard.press('Enter');
  await expect(details.getByRole('heading', { name: 'dmz gateway' })).toBeVisible();

  expect(problems).toEqual([]);
});
