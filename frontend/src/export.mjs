// Escape spreadsheet formulas as well as CSV delimiters. Missing data stays blank.
export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function toCsv(report, team, manual) {
  const rows = [['WHO EMT MDS — DRAFT REVIEW EXPORT (not the official eDATA format)'],
    ['Location', report.location.display], ['Location UUID', report.location.uuid],
    ['Timezone', report.timezone], ['Frequency', report.frequency], ['Generated at', report.generatedAt],
    ...Object.entries(team), ['End boundaries are exclusive'],
    ['Period start', 'Period end', 'MDS ID', 'Indicator', 'Age band', 'Value', 'Status']];
  for (const [index, bucket] of report.reports.entries()) {
    for (const row of bucket.rows) {
      const values = row.counts ? Object.entries(row.counts).filter(([key]) =>
        row.bands !== 'total' || key === 'Total') : [['', manual[`${index}:${row.id}`] ?? '']];
      for (const [band, value] of values)
        rows.push([bucket.start, bucket.end, row.id, row.label, band, value,
          !row.counts && manual[`${index}:${row.id}`] ? 'Manual — review required' : row.status]);
    }
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
