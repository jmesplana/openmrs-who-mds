const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Explicit opt-in: uses the standard demo login on a local instance only.
test('installed backend works in the real O3 shell with local frontend assets', async ({ page }) => {
  test.skip(process.env.WHO_MDS_LIVE !== '1', 'Requires a local demo OpenMRS and installed WHO MDS backend.');
  test.setTimeout(90000);
  const base = 'http://localhost/openmrs';
  const authorization = 'Basic ' + Buffer.from('admin:Admin123').toString('base64');
  const session = await page.request.get(`${base}/ws/rest/v1/session`, { headers: { Authorization: authorization } });
  expect((await session.json()).authenticated).toBe(true);
  await page.request.post(`${base}/ws/rest/v1/session`, { data: { sessionLocation: '8d9045ad-50f0-45b8-93c8-3ed4bce19dbf' } });
  await page.route('**/importmap.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.imports['@who-mds/esm-who-mds-app'] = './who-mds/who-mds-esm-who-mds-app.js';
    await route.fulfill({ response, json: data });
  });
  await page.route('**/routes.registry.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.routes['@who-mds/esm-who-mds-app'] = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../dist/routes.json')));
    await route.fulfill({ response, json: data });
  });
  await page.route('**/spa/who-mds/*', route => {
    const name = path.basename(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.resolve(__dirname, '../dist', name)) });
  });
  await page.goto(`${base}/spa/who-mds`);
  await expect(page.getByRole('heading', { name: 'WHO EMT MDS', exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption('8d9045ad-50f0-45b8-93c8-3ed4bce19dbf');
  await page.getByLabel('Reporting timezone').fill('Asia/Manila');
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.getByText('DRAFT · REVIEW REQUIRED')).toBeVisible();
  // Either state is valid: 'Not configured' with no mappings loaded, or a mapped count once
  // config/mappings.sample-demo.json is in the whomds.mappings global property. What must never
  // happen is a blank or a bare zero with no status.
  await expect(page.getByRole('row').filter({ hasText: 'Acute respiratory infection' }).first())
    .toContainText(/Not configured|Mapped — review required|Mapping not reviewed/);
});
