import React, { useEffect, useRef, useState } from 'react';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { toCsv } from './export.mjs';
import PrintableForm from './form.component';
import './styles.css';

interface Row { id: string; label: string; section: string; bands: string; status: string; counts: Record<string, number> | null }
interface Report { status: string; location: { uuid: string; display: string }; timezone: string; frequency: string; generatedAt: string;
  start: string; end: string; warnings: string[]; reports: { start: string; end: string; rows: Row[] }[] }

// Derive the backend context path so deployments need not be hosted at /openmrs.
const endpoint = `${restBaseUrl.replace(/\/ws\/rest\/v1\/?$/, '')}/moduleServlet/whomds/report`;
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T00:00`;
const today = localDate(new Date());
const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);

export default function ReportApp() {
  const [locations, setLocations] = useState<{ uuid: string; display: string }[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [location, setLocation] = useState('');
  const [start, setStart] = useState(localDate(yesterdayDate));
  const [end, setEnd] = useState(today);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [frequency, setFrequency] = useState('daily');
  const [explicitOffsets, setExplicitOffsets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [team, setTeam] = useState<Record<string, string>>({ 'Organization': '', 'Team name': '', 'EMT type': '', 'Contact person': '', 'Phone': '', 'Email': '', 'Departure date': '', 'Admin 1': '', 'Admin 2': '', 'Admin 3': '', 'Facility': '', 'Latitude': '', 'Longitude': '' });
  const [manual, setManual] = useState<Record<string, string>>({});
  const requestId = useRef(0);
  const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC'];

  useEffect(() => {
    let active = true;
    openmrsFetch(`${endpoint}?action=locations`).then(({ data }) => {
      if (active) setLocations(data.results);
    }).catch(() => { if (active) setError('Cannot load reporting locations. Check sign-in, module installation and your reporting privileges.'); })
      .finally(() => { if (active) setLoadingLocations(false); });
    return () => { active = false; requestId.current++; };
  }, []);

  function invalidate() { requestId.current++; setReport(null); setManual({}); setBusy(false); setError(''); }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    const current = ++requestId.current;
    setBusy(true); setError(''); setReport(null); setManual({});
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
      const params = new URLSearchParams({ location, start, end, timezone, frequency });
      const { data } = await openmrsFetch(`${endpoint}?${params}`);
      if (current === requestId.current) setReport(data);
    } catch (failure: any) {
      if (current === requestId.current) setError(failure?.responseBody?.error || failure?.response?.data?.error || failure?.message || 'Report generation failed. Check the filters and your permissions.');
    } finally { if (current === requestId.current) setBusy(false); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([toCsv(report, team, manual)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `who-mds-draft-${report.frequency}-${report.start.slice(0, 10)}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function format(value: string) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: report?.timezone || timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  return <main className="who-mds">
    <header><p className="eyebrow">Emergency Medical Teams · Reporting</p><h1>WHO EMT MDS</h1>
      <p>Review clinical activity for one location and a defined reporting period.</p></header>
    <form onSubmit={generate} className="filters no-print">
      <label>Location<select required value={location} disabled={loadingLocations} onChange={e => { invalidate(); setLocation(e.target.value); }}>
        <option value="">{loadingLocations ? 'Loading locations…' : 'Select a location'}</option>
        {locations.map(item => <option key={item.uuid} value={item.uuid}>{item.display}</option>)}
      </select></label>
      <label>Report interval<select value={frequency} onChange={e => { invalidate(); setFrequency(e.target.value); }}>
        <option value="daily">Daily reports</option><option value="weekly">Weekly summaries</option></select></label>
      <label>Start date and time<input required type={explicitOffsets ? 'text' : 'datetime-local'} placeholder="2026-11-18T00:00" value={start} onChange={e => { invalidate(); setStart(e.target.value); }}/></label>
      <label>End date and time (exclusive)<input required type={explicitOffsets ? 'text' : 'datetime-local'} placeholder="2026-11-19T00:00" value={end} onChange={e => { invalidate(); setEnd(e.target.value); }}/></label>
      <label>Reporting timezone<input required list="who-mds-timezones" value={timezone} onChange={e => { invalidate(); setTimezone(e.target.value); }}/>
        <datalist id="who-mds-timezones"><option value="UTC"/>{timezones.map(zone => <option key={zone} value={zone}/>)}</datalist></label>
      <button type="submit" disabled={busy || !location}>{busy ? 'Generating…' : 'Generate report'}</button>
      <label className="offset-toggle"><input type="checkbox" checked={explicitOffsets} onChange={e => { invalidate(); setExplicitOffsets(e.target.checked); if (!e.target.checked) { setStart(start.slice(0, 16)); setEnd(end.slice(0, 16)); } }}/>Enter explicit UTC offsets for daylight-saving transitions</label>
      <p className="help">Times are interpreted in the selected timezone. With explicit offsets enabled, use e.g. 2026-10-25T02:30+01:00. Intervals start at your chosen local cutoff; a final interval may be partial.</p>
    </form>
    {error && <div role="alert" className="error">{error}</div>}
    {!loadingLocations && locations.length === 0 && !error && <p role="status">No reporting locations are assigned to your account. Ask an administrator to grant location reporting access.</p>}
    {busy && <p role="status">Calculating the selected reporting period…</p>}
    {!report && !busy && <section className="empty"><h2>Your report will appear here</h2><p>Select a location and reporting period to begin. Unmapped indicators are shown as missing, never as zero.</p></section>}
    {report && <>
      <section className="report-heading"><div><span className="draft">DRAFT · REVIEW REQUIRED</span><h2>{report.location.display}</h2>
        <p>{format(report.start)} – {format(report.end)} · {report.timezone}</p>
        <p>{report.frequency === 'weekly' ? 'Weekly summary' : 'Daily reporting'} · Generated {format(report.generatedAt)}</p></div>
        <div className="actions no-print"><button type="button" onClick={download}>Download review CSV</button><button type="button" onClick={() => window.print()}>Print / save PDF</button></div>
      </section>
      <aside className="notice"><ul>{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></aside>
      <details className="team" open><summary>Team and deployment information</summary><div className="team-grid">
        {Object.entries(team).map(([key, value]) => <label key={key}>{key}<input value={value} onChange={e => setTeam({ ...team, [key]: e.target.value })}/></label>)}
      </div></details>
      {report.reports.map((bucket, index) => <section className="bucket" key={bucket.start}>
        <h2>{format(bucket.start)} – {format(bucket.end)}</h2>
        {Array.from(new Set(bucket.rows.map(row => row.section))).map(section => <div key={section}>
          <h3>{section}</h3>
          {section === 'Needs and risks' ? <div className="notes-grid">{bucket.rows.filter(row => row.section === section).map(row => <label key={row.id}>
            {row.id}. {row.label}<textarea className="no-print" rows={2} placeholder="Not assessed / not entered" value={manual[`${index}:${row.id}`] || ''}
              onChange={e => setManual({ ...manual, [`${index}:${row.id}`]: e.target.value })}/><span className="print-note">{manual[`${index}:${row.id}`] || 'Not assessed / not entered'}</span></label>)}</div>
          : <div className="table-wrap"><table><thead><tr><th scope="col">MDS</th><th scope="col">Indicator</th>
            {(section === 'Sex and age' ? ['<1', '1–4', '5–17', '18–64', '65+', 'Unknown age'] : ['Health events', 'Procedures'].includes(section) ? ['<5', '5+', 'Unknown age'] : []).map(band => <th scope="col" key={band}>{band}</th>)}
            <th scope="col">Total</th><th scope="col">Status</th></tr></thead>
            <tbody>{bucket.rows.filter(row => row.section === section).map(row => <tr key={row.id}>
              <td>{row.id}</td><th scope="row">{row.label}</th>
              {(row.bands === 'demographic' ? ['<1', '1–4', '5–17', '18–64', '65+', 'Unknown age'] : row.bands === 'clinical' ? ['<5', '5+', 'Unknown age'] : []).map(band => <td key={band}>{row.counts?.[band] ?? '—'}</td>)}
              <td>{section === 'Bed snapshot' ? <input aria-label={row.label} type="number" min="0" step="1" value={manual[`${index}:${row.id}`] || ''}
                onChange={e => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) setManual({ ...manual, [`${index}:${row.id}`]: e.target.value }); }}/>
                : row.counts?.Total ?? '—'}</td><td>{manual[`${index}:${row.id}`] ? 'Manual — review required' : row.status}</td>
            </tr>)}</tbody></table></div>}
        </div>)}
      </section>)}
      <PrintableForm report={report} team={team} manual={manual}/>
      <p className="help">Manual entries stay in this page and are included in the downloaded CSV and printed report. They are not saved to OpenMRS. Record bed snapshots at the period end. Use the agreed confidential reporting pathway for protection details; do not enter patient identifiers here.</p>
    </>}
  </main>;
}
