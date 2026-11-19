const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const dist = path.resolve(__dirname, '../dist');

test('built O3 container renders filters, missing values, exports and invalidates stale reports', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('http://mds.test/**', route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name === '') return route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><div id="root"></div></body></html>' });
    const files = { 'react.js': require.resolve('react/package.json').replace('package.json', 'umd/react.development.js'),
      'react-dom.js': require.resolve('react-dom/package.json').replace('package.json', 'umd/react-dom.development.js') };
    const file = files[name] || path.join(dist, path.basename(name));
    route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(file) });
  });
  await page.goto('http://mds.test/');
  await page.addScriptTag({ url: 'http://mds.test/react.js' });
  await page.addScriptTag({ url: 'http://mds.test/react-dom.js' });
  await page.addScriptTag({ url: 'http://mds.test/who-mds-esm-who-mds-app.js' });
  await page.evaluate(async () => {
    const R = window.React;
    const framework = {
      restBaseUrl: '/openmrs/ws/rest/v1',
      ConfigurableLink: ({ children }) => R.createElement('a', { href: '/openmrs/spa/who-mds' }, children),
      getAsyncLifecycle: loader => ({ mount: async () => {
        const Component = (await loader()).default;
        window.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(Component));
      } }),
      openmrsFetch: async url => {
        if (url.includes('action=locations')) return { data: { results: [{ uuid: 'location-a', display: 'Test Clinic' }] } };
        window.lastReportUrl = url;
        return { data: { status: 'DRAFT', location: { uuid: 'location-a', display: 'Test Clinic' }, timezone: 'Asia/Manila', frequency: 'daily',
          start: '2026-11-18T00:00:00Z', end: '2026-11-19T00:00:00Z', generatedAt: '2026-11-19T01:00:00Z', warnings: ['Draft report'],
          reports: [{ start: '2026-11-18T00:00:00Z', end: '2026-11-19T00:00:00Z', rows: [
            { id: '9', label: 'Acute respiratory infection', section: 'Health events', bands: 'clinical', counts: null, status: 'Not configured' },
            { id: '10', label: 'Acute watery diarrhea', section: 'Health events', bands: 'clinical', counts: { '<5': 0, '5+': 0, 'Unknown age': 0, Total: 0 }, status: 'Mapped — review required' },
          ] }] } };
      }
    };
    const share = (value, version) => ({ [version]: { get: () => () => value, loaded: true, from: 'test-shell' } });
    await window._who_mds_esm_who_mds_app.init({ react: share(R, '18.3.1'), 'react-dom': share(window.ReactDOM, '18.3.1'), '@openmrs/esm-framework': share(framework, '11.0.0') });
    const app = (await window._who_mds_esm_who_mds_app.get('./start'))();
    await app.root.mount();
  });
  await expect(page.getByRole('heading', { name: 'WHO EMT MDS', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption('location-a');
  await page.getByLabel('Reporting timezone').fill('Asia/Manila');
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.getByText('DRAFT · REVIEW REQUIRED')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Acute respiratory infection' })).toContainText('Not configured');
  expect(await page.evaluate(() => window.lastReportUrl)).toContain('timezone=Asia%2FManila');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download review CSV' }).click();
  expect((await download).suggestedFilename()).toContain('who-mds-draft-daily');
  await page.getByRole('combobox', { name: 'Report interval', exact: true }).selectOption('weekly');
  await expect(page.getByText('DRAFT · REVIEW REQUIRED')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
