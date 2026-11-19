import React from 'react';

// Print-only replica of the official WHO "EMT-MDS Daily Reporting Form" (Ver 2019).
// The on-screen report stays a flowing, accessible review surface; this component reproduces the
// one-page form grid so the printed/PDF output matches what EMTCC and ministries expect to receive.
// One page is emitted per reporting interval, per the form's own instruction to "submit one form
// per one activity day and location".

interface Row {
  id: string;
  label: string;
  section: string;
  bands: string;
  status: string;
  counts: Record<string, number> | null;
}
interface Bucket {
  start: string;
  end: string;
  rows: Row[];
}
interface Report {
  status: string;
  location: { uuid: string; display: string };
  timezone: string;
  frequency: string;
  generatedAt: string;
  start: string;
  end: string;
  warnings: string[];
  reports: Bucket[];
}

// The printed form shows the official MDS wording, which is more abbreviated than the labels used
// on screen. Only the rows whose wording differs are listed; everything else falls back to `label`.
const FORM_LABELS: Record<string, string> = {
  o: 'Total Number of new consultation ‡',
  '40': 'New admission (=MDS40)',
  q: 'Live Birth',
  r: 'Total bed capacity',
  s: 'Empty inpatient bed (Non-ICU)',
  t: 'Empty Intensive Care Unit Bed (ICU)',
  '2': 'Female non-preg.',
  '3': 'Female pregnant',
  '23': 'Surgical emergency (Non-trauma)',
  '24': 'Medical emergency (Non-infectious)',
  '28': 'Severe Acute Malnutrition (SAM) *',
  '29': 'Other diagnosis, not specified above',
  '30': 'Major procedure (excluding MDS31)',
  '31': 'Limb amputation excluding digits *',
  '32': 'Minor surgical procedure',
  '33': 'Normal Vaginal Delivery (NVD)',
  '34': 'Caesarean section',
  '35': 'Obstetrics others',
  '42': 'Death within facility *',
  '43': 'Requiring long term rehabilitation *',
  '47': 'Vulnerable child *',
  '48': 'Vulnerable adult *',
  '49': 'Sexual Gender Based Violence (SGBV) *',
  '50': 'Violence (non-SGBV) *',
  '51': 'Unexpected death *',
  '52': 'Notifiable disease *',
  '53': 'Protection issues #',
  '54': 'Critical incident to EMT and/or community',
  '55': 'Any other issue requiring immediate reporting',
  '57': 'Community / suspected over infectious disease',
  '58': 'Environmental risk / exposure',
  '59': 'Shelter / Non food items',
  '61': 'Logistics / operational support',
  '65': 'Others',
};

// Sub-group spine labels down the left of the clinical block, keyed by the first MDS id in each run.
const CLINICAL_GROUPS: { from: number; to: number; label: string }[] = [
  { from: 4, to: 8, label: 'Trauma' },
  { from: 9, to: 18, label: 'Infectious disease' },
  { from: 19, to: 22, label: 'Additional §' },
  { from: 23, to: 24, label: 'Emrg.' },
  { from: 25, to: 29, label: 'Other key diseases' },
];

const label = (row: Row) => FORM_LABELS[row.id] ?? row.label;
const cell = (row: Row, band: string) => {
  const value = row.counts?.[band];
  return value === undefined || value === null ? '' : String(value);
};

function TeamField({ letter, name, value, hint }: { letter: string; name: string; value?: string; hint?: string }) {
  return (
    <tr>
      <td className="mds-letter">{letter}</td>
      <td className="mds-field">
        <span className="mds-field-name">
          {name}
          {hint ? <span className="mds-hint"> {hint}</span> : null}
        </span>
        <span className="mds-field-value">{value || ''}</span>
      </td>
    </tr>
  );
}

export default function PrintableForm({
  report,
  team,
  manual,
}: {
  report: Report;
  team: Record<string, string>;
  manual: Record<string, string>;
}) {
  const dmy = (value: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: report.timezone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      new Date(value),
    );
  const hm = (value: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: report.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
      new Date(value),
    );

  return (
    <div className="mds-forms">
      {report.reports.map((bucket, index) => {
        // Manual entries (bed snapshot) override the aggregated value for the printed cell.
        const value = (row: Row, band: string) => manual[`${index}:${row.id}`] || cell(row, band);
        const byId = (id: string) => bucket.rows.find(row => row.id === id);
        const section = (name: string) => bucket.rows.filter(row => row.section === name);
        const clinical = (from: number, to: number) =>
          bucket.rows.filter(row => {
            const n = Number(row.id);
            return Number.isFinite(n) && n >= from && n <= to;
          });

        const outcomes = section('Outcomes');
        const context = section('Context and protection');
        const needs = section('Needs and risks');
        const demographic = section('Sex and age');
        const procedures = section('Procedures');

        return (
          <section className="mds-form" key={bucket.start}>
            <header className="mds-head">
              <div className="mds-logo">Insert logo of Ministry of Health</div>
              <h1>EMT-MDS Daily Reporting Form</h1>
              <div className="mds-who">
                <span className="mds-who-mark" aria-hidden="true" />
                <span className="mds-ver">Ver 2019 WHO</span>
              </div>
            </header>

            {/* Team information + date/location */}
            <div className="mds-band mds-band-team">
              <div className="mds-spine mds-spine-blue">Team Information</div>
              <table className="mds-team">
                <tbody>
                  <TeamField letter="a" name="Organization name:" value={team['Organization']} />
                  <TeamField letter="b" name="Team name:" value={team['Team name']} />
                  <tr>
                    <td className="mds-letter">c</td>
                    <td className="mds-field mds-field-types">
                      <table className="mds-types">
                        <thead>
                          <tr>
                            <th>Type 1 mobile</th>
                            <th>Type 1 fixed</th>
                            <th>Type 2</th>
                            <th>Type 3</th>
                            <th>Specialized cell</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {['Type 1 mobile', 'Type 1 fixed', 'Type 2', 'Type 3', 'Specialized cell'].map(type => (
                              <td key={type}>{team['EMT type'] === type ? '✓' : ''}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <TeamField letter="d" name="Contact Person(s) name(s):" value={team['Contact person']} />
                  <TeamField letter="e" name="Phone No.:" value={team['Phone']} />
                  <TeamField letter="f" name="Email:" value={team['Email']} />
                  <TeamField letter="g" name="Estimated date of departure" hint="(dd/mm/yyyy):" value={team['Departure date']} />
                </tbody>
              </table>
              <table className="mds-when">
                <tbody>
                  <TeamField letter="h" name="Date of activity" hint="(dd/mm/yyyy):" value={dmy(bucket.start)} />
                  <TeamField
                    letter="i"
                    name="Time of reporting"
                    hint="(dd/mm/yyyy/hh:mm(24h)):"
                    value={`${dmy(bucket.end)} ${hm(bucket.end)}`}
                  />
                  <tr>
                    <td className="mds-letter" />
                    <td className="mds-location-head">Location &dagger;</td>
                  </tr>
                  <TeamField letter="j" name="State etc." hint="(admin1)" value={team['Admin 1']} />
                  <TeamField letter="k" name="City etc." hint="(admin2)" value={team['Admin 2']} />
                  <TeamField letter="l" name="Village etc." hint="(admin3)" value={team['Admin 3']} />
                  <TeamField letter="m" name="Facility name:" value={team['Facility'] || report.location.display} />
                  <tr>
                    <td className="mds-letter">n</td>
                    <td className="mds-field mds-geo">
                      <span className="mds-field-name">Geo-tag</span>
                      <span className="mds-geo-pair">
                        <span className="mds-geo-value">{team['Latitude'] || ''}</span>
                        <span className="mds-geo-label">(Lat)</span>
                        <span className="mds-geo-value">{team['Longitude'] || ''}</span>
                        <span className="mds-geo-label">(Long)</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mds-note">
              &dagger; Submit one form per one activity day and location. For Admin 1 = e.g. State, Province, Governorate; Admin 2 =
              e.g. County, District, City, Municipality; Admin 3 = e.g. Sub-district, Village, Payam.
            </p>

            {/* Daily summary / outcome / relation + protection */}
            <div className="mds-band mds-band-summary">
              <div className="mds-spine mds-spine-blue">Daily Summary</div>
              <table className="mds-grid mds-summary">
                <tbody>
                  <tr>
                    <td className="mds-subhead" colSpan={3}>
                      Number of patient / Bed Count
                    </td>
                  </tr>
                  {['o', '40', 'q'].map((id, i) => {
                    const row = byId(id);
                    return (
                      <tr key={id}>
                        {i === 0 ? (
                          <td className="mds-vspine" rowSpan={3}>
                            Patients
                          </td>
                        ) : null}
                        <th scope="row">{row ? label(row) : ''}</th>
                        <td className="mds-value">{row ? value(row, 'Total') : ''}</td>
                      </tr>
                    );
                  })}
                  {['r', 's', 't'].map((id, i) => {
                    const row = byId(id);
                    return (
                      <tr key={id}>
                        {i === 0 ? (
                          <td className="mds-vspine" rowSpan={4}>
                            Bed
                          </td>
                        ) : null}
                        <th scope="row">{row ? label(row) : ''}</th>
                        <td className="mds-value">{row ? value(row, 'Total') : ''}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row" className="mds-blank">
                      <span className="mds-letter-inline">u</span>
                    </th>
                    <td className="mds-value" />
                  </tr>
                </tbody>
              </table>

              <div className="mds-spine mds-spine-green mds-spine-stats">MDS statistics &dagger;</div>

              <table className="mds-grid mds-outcome">
                <tbody>
                  {outcomes.map((row, i) => (
                    <tr key={row.id}>
                      {i === 0 ? (
                        <td className="mds-vspine" rowSpan={outcomes.length}>
                          Outcome
                        </td>
                      ) : null}
                      <td className="mds-no">{row.id}</td>
                      <th scope="row">{label(row)}</th>
                      <td className="mds-value">{value(row, 'Total')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="mds-grid mds-context">
                <tbody>
                  {context.map((row, i) => (
                    <tr key={row.id}>
                      {i === 0 ? (
                        <td className="mds-vspine" rowSpan={3}>
                          Relation
                        </td>
                      ) : i === 3 ? (
                        <td className="mds-vspine" rowSpan={4}>
                          Protection
                        </td>
                      ) : null}
                      <td className="mds-no">{row.id}</td>
                      <th scope="row">{label(row)}</th>
                      <td className="mds-value">{value(row, 'Total')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mds-note">
              &dagger; Consider 24 hours period from midnight or other agreed cut off time for reporting. MDS statistics report
              outpatient consultations, inpatient admissions, as well as preformed procedures (MDS No.30&ndash;35), outcomes (MDS
              36&ndash;43) and contextual issues (MDS No.44&ndash;50) newly counted during the reported period. MDS No.43 is a subset of
              MDS No.37-38. MDS No.47-50 are a subset of MDS No.53.
            </p>

            {/* Demographic + needs and risks */}
            <div className="mds-band mds-band-lower">
              <div className="mds-col-left">
                <div className="mds-spine-row">
                  <div className="mds-spine mds-spine-blue">Demographic</div>
                  <div className="mds-spine mds-spine-green">MDS statistics</div>
                  <table className="mds-grid mds-demo">
                    <thead>
                      <tr>
                        <th className="mds-no">No</th>
                        <th className="mds-vspine-head" />
                        <th>Age Categories</th>
                        <th>&lt;1</th>
                        <th>1-4</th>
                        <th>5-17</th>
                        <th>18-64</th>
                        <th>65-</th>
                        <th className="mds-total">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demographic.map((row, i) => (
                        <tr key={row.id}>
                          <td className="mds-no">{row.id}</td>
                          {i === 0 ? (
                            <td className="mds-vspine" rowSpan={demographic.length}>
                              Sex &amp; Age
                            </td>
                          ) : null}
                          <th scope="row">{label(row)}</th>
                          {['<1', '1–4', '5–17', '18–64', '65+'].map(band => (
                            <td
                              key={band}
                              className={`mds-value${row.id === '3' && band === '<1' ? ' mds-blocked' : ''}`}
                            >
                              {row.id === '3' && band === '<1' ? '' : value(row, band)}
                            </td>
                          ))}
                          <td className="mds-value">{value(row, 'Total')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mds-spine-row mds-clinical-wrap">
                  <div className="mds-spine mds-spine-blue">Health Events and Procedure</div>
                  <div className="mds-spine mds-spine-green">MDS statistics</div>
                  <table className="mds-grid mds-clinical">
                    <thead>
                      <tr>
                        <th className="mds-no">No</th>
                        <th className="mds-vspine-head" />
                        <th className="mds-grey">Health Events</th>
                        <th className="mds-grey">&lt;5</th>
                        <th className="mds-grey">&gt;=5</th>
                        <th className="mds-total">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CLINICAL_GROUPS.flatMap(group => {
                        const rows = clinical(group.from, group.to);
                        return rows.map((row, i) => (
                          <tr key={row.id} className={i === 0 ? 'mds-group-start' : undefined}>
                            <td className="mds-no">{row.id}</td>
                            {i === 0 ? (
                              <td className="mds-vspine" rowSpan={rows.length}>
                                {group.label}
                              </td>
                            ) : null}
                            <th scope="row">{Number(row.id) >= 19 && Number(row.id) <= 22 ? '' : label(row)}</th>
                            <td className="mds-value">{value(row, '<5')}</td>
                            <td className="mds-value">{value(row, '5+')}</td>
                            <td className="mds-value">{value(row, 'Total')}</td>
                          </tr>
                        ));
                      })}
                      <tr className="mds-subhead-row">
                        <td colSpan={3} className="mds-grey mds-centre">
                          Procedure
                        </td>
                        <td className="mds-grey mds-centre">&lt;5</td>
                        <td className="mds-grey mds-centre">&gt;=5</td>
                        <td className="mds-total">Total</td>
                      </tr>
                      {procedures.map((row, i) => (
                        <tr key={row.id}>
                          <td className="mds-no">{row.id}</td>
                          {i === 0 ? (
                            <td className="mds-vspine" rowSpan={procedures.length}>
                              Procedure
                            </td>
                          ) : null}
                          <th scope="row">{label(row)}</th>
                          <td className={`mds-value${Number(row.id) >= 33 ? ' mds-blocked' : ''}`}>
                            {Number(row.id) >= 33 ? '' : value(row, '<5')}
                          </td>
                          <td className="mds-value">{value(row, '5+')}</td>
                          <td className="mds-value">{value(row, 'Total')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mds-col-right">
                <div className="mds-needs-head">Needs and Risks</div>
                <div className="mds-needs-sub">Free text reporting to EMTCC / MOH on the following issues.</div>
                <table className="mds-grid mds-needs">
                  <tbody>
                    {needs.map((row, i) => (
                      <tr key={row.id}>
                        <td className="mds-no">{row.id}</td>
                        {i === 0 ? (
                          <td className="mds-vspine" rowSpan={5}>
                            Immediate report
                          </td>
                        ) : i === 5 ? (
                          <td className="mds-vspine" rowSpan={5}>
                            Community Risks
                          </td>
                        ) : i === 10 ? (
                          <td className="mds-vspine" rowSpan={5}>
                            Operational constraints
                          </td>
                        ) : null}
                        <th scope="row">{label(row)}</th>
                        <td className="mds-check">{manual[`${index}:${row.id}`] ? '☒' : '☐'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* The official form carries four free-text comment blocks. Any notes typed against a
                    needs/risks row are printed here so the reviewer sees them in context. */}
                {[0, 1, 2, 3].map(slot => {
                  const entries = needs
                    .map(row => ({ row, text: manual[`${index}:${row.id}`] }))
                    .filter(entry => entry.text);
                  const entry = entries[slot];
                  return (
                    <div className="mds-comment" key={slot}>
                      <div className="mds-comment-head">Detailed comment for ( No. {entry ? entry.row.id : ''} )</div>
                      <div className="mds-comment-body">{entry ? entry.text : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mds-foot">
              * Line list (including detailed information) should be submitted with this MDS form to relevant authorities. &sect;
              Additionals are used for context specific reporting items indicated by the relevant authorities e.g. Malaria / Dengue /
              TB / Leptospirosis / Rabies / Hazmat etc. # Protection issues to be reported confidentially to appropriate authority or
              protection cluster in locally agreed manner.
            </p>

            <p className="mds-draft-mark">
              DRAFT &middot; REVIEW REQUIRED &middot; generated {dmy(report.generatedAt)} {hm(report.generatedAt)} ({report.timezone})
            </p>
          </section>
        );
      })}
    </div>
  );
}
