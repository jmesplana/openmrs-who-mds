import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../src/export.mjs';

test('CSV escapes delimiters, quotes and spreadsheet formulas', () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell(' @SUM(1)'), '"\' @SUM(1)"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(0), '"0"');
});
test('export preserves unknown versus zero and includes period and location', () => {
  const report = { location: { uuid: 'loc-1', display: 'Clinic' }, timezone: 'Asia/Manila', frequency: 'daily',
    generatedAt: '2026-01-02T00:00:00Z', reports: [{start: 'start', end: 'end', rows: [
      { id: '9', label: 'ARI', bands: 'total', status: 'Not configured', counts: null },
      { id: '10', label: 'Diarrhea', bands: 'total', status: 'Mapped', counts: { Total: 0 } },
      { id: 'r', label: 'Beds', bands: 'total', status: 'Manual entry required', counts: null },
  ]}] };
  const csv = toCsv(report, { Organization: 'Team A' }, { '0:r': '0' });
  assert.ok(csv.includes('"ARI","","","Not configured"'));
  assert.ok(csv.includes('"Diarrhea","Total","0","Mapped"'));
  assert.ok(csv.includes('"Beds","","0","Manual — review required"'));
  assert.ok(csv.includes('"Location UUID","loc-1"'));
  assert.ok(csv.includes('"Timezone","Asia/Manila"'));
  assert.ok(csv.includes('not the official eDATA format'));
});
