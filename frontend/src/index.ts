import { getAsyncLifecycle } from '@openmrs/esm-framework';

const options = { featureName: 'WHO EMT MDS', moduleName: '@who-mds/esm-who-mds-app' };
export const root = getAsyncLifecycle(() => import('./report.component'), options);
export const appMenuLink = getAsyncLifecycle(() => import('./menu.component'), options);
