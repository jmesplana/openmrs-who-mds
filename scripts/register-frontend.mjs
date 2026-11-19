import fs from 'node:fs';
import path from 'node:path';

// Work on a copied SPA directory, never replace the host's other modules.
const [directory, assetUrl = './who-mds/who-mds-esm-who-mds-app.js'] = process.argv.slice(2);
if (!directory) throw new Error('Usage: node scripts/register-frontend.mjs SPA_DIRECTORY [ASSET_URL]');
const moduleName = '@who-mds/esm-who-mds-app';
const importFile = path.join(directory, 'importmap.json');
const routesFile = path.join(directory, 'routes.registry.json');
const imports = JSON.parse(fs.readFileSync(importFile, 'utf8'));
const registry = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
if (!imports.imports || !registry.routes) throw new Error('Unrecognized OpenMRS import map or routes registry; no files changed.');
const routes = JSON.parse(fs.readFileSync(new URL('../frontend/dist/routes.json', import.meta.url), 'utf8'));
imports.imports[moduleName] = assetUrl;
registry.routes[moduleName] = routes;
for (const [file, value] of [[importFile, imports], [routesFile, registry]]) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
}
console.log('Registered WHO EMT MDS while preserving existing OpenMRS modules.');
