/**
 * SEED — one fictional firm. Everything enters through the SAME event ingress the demo
 * uses, so every seeded fact carries real provenance and a real run trace. Nothing is
 * written straight into the derived tables.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { q, pool } from './db.js';
import { id } from './ids.js';
import { ingest } from './engine/ingress.js';
import { sweep } from './core/sweeper.js';
import { todayInTz, addDays, nextWeekday, ISODate } from './core/time.js';

export async function runSeed() {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
  const schema = await readFile(`${root}packages/db/schema.sql`, 'utf8');
  await pool.query(schema);

  const manifest = JSON.parse(await readFile(`${root}fixtures/generated/manifest.json`, 'utf8'));
  const F = (k: string) => ({ ...manifest[k], path: `${root}fixtures/generated/${manifest[k].filename}` });

  const today: ISODate = todayInTz();
  const at = (d: ISODate, t = '10:00:00') => `${d}T${t}Z`;
  const back = (n: number) => addDays(today, -n);

  // ---------------------------------------------------------------- actors
  const LAWYER = id('act');
  await q(`INSERT INTO actor (id,name,role,kind) VALUES
    ($1,'Marcus Vance','Lawyer','human'),
    ($2,'Ava','Agent','ai'),
    ($3,'Spine','Workflow engine','system')`, [LAWYER, id('act'), id('act')]);

  // ---------------------------------------------------------------- matters
  const MATTERS = [
    { ref: 'R. v. Okafor', file: '2026-CR-0892', client: 'Kelechi Okafor', phone: '(416) 555-0142',
      charges: ['Possession for the purpose of trafficking'], court: addDays(today, 14), crown: 'A. Henderson' },
    { ref: 'R. v. Miller', file: '2026-CR-0714', client: 'Sarah Miller', phone: '(416) 555-0194',
      charges: ['Impaired operation'], court: addDays(today, 21), crown: 'K. Wong' },
    { ref: 'R. v. Tremblay', file: '2026-CR-0542', client: 'Luc Tremblay', phone: '(647) 555-0388',
      charges: ['Assault'], court: addDays(today, 12), crown: 'D. Stewart' },
    { ref: 'R. v. Santos', file: '2026-CR-1102', client: 'Ana Santos', phone: '(647) 555-0921',
      charges: ['Breach of undertaking'], court: addDays(today, 30), crown: 'M. Ibrahim' },
    { ref: 'R. v. Chen', file: '2026-CR-0421', client: 'Wei Chen', phone: '(905) 555-0117',
      charges: ['Impaired operation over 80'], court: addDays(today, 40), crown: 'J. Laurent' },
    { ref: 'R. v. Gauthier', file: '2026-CR-0389', client: 'Pierre Gauthier', phone: '(613) 555-0455',
      charges: ['Mischief under $5000'], court: addDays(today, 15), crown: 'S. Oyelaran' },
    { ref: 'R. v. Al-Mansoor', file: '2026-CR-0980', client: 'Nadia Al-Mansoor', phone: '(416) 555-0733',
      charges: ['Fraud under $5000'], court: addDays(today, 45), crown: 'R. Petrov' },
    { ref: 'R. v. Kelly', file: '2026-CR-1204', client: 'Declan Kelly', phone: '(416) 555-0266',
      charges: ['Assault'], court: addDays(today, 60), crown: 'T. Nakamura' },
  ];

  for (const m of MATTERS) {
    await ingest({
      type: 'matter.opened', idempotency_key: `seed:matter:${m.ref}`,
      occurred_at: at(back(120)),
      payload: {
        matter_ref: m.ref, client: { name: m.client, phone: m.phone },
        charges: m.charges, crown_contact: m.crown,
        key_dates: { next_court_date: m.court, court_file: m.file },
      },
    });
  }

  // ------------------------------------------------- Okafor request register (14 items)
  const OKAFOR_ITEMS = [
    { description: 'Body-worn camera footage — Cst. Reyes, arrest interaction', category: 'body_worn_camera' },
    { description: 'Arresting officer notebook entries — Cst. Reyes', category: 'officer_notes' },
    { description: '911 call audio and dispatch CAD logs', category: '911_audio' },
    { description: 'Breath-test calibration and maintenance records', category: 'calibration_certificate' },
    { description: 'Cruiser dashcam video, Unit 214', category: 'cctv' },
    { description: 'Search warrant information and ITO', category: 'warrant_ito' },
    { description: 'Toxicology report, Centre of Forensic Sciences', category: 'toxicology' },
    { description: 'Booking room custody video', category: 'cctv' },
    { description: 'Expert qualification sheet — analyst', category: 'other' },
    { description: 'Will-say statement, civilian witness', category: 'witness_statement' },
    { description: 'Property seizure log and locker receipts', category: 'property_log' },
    { description: 'Chain of custody log for seized property', category: 'property_log' },
    { description: 'Speed radar calibration certificate', category: 'calibration_certificate' },
    { description: 'Crown screening memo and charge assessment', category: 'crown_memo' },
  ];

  await ingest({
    type: 'disclosure.request.sent', idempotency_key: 'seed:req:okafor',
    occurred_at: at(back(94)),
    payload: { matter_ref: 'R. v. Okafor', channel: 'portal', sent_at: at(back(94)),
      letter_ref: 'DISC-OKAFOR-1', items: OKAFOR_ITEMS },
  });

  // Smaller registers for the other matters so firm-level rollups are real.
  const OTHER_REGISTERS: [string, number, string[]][] = [
    ['R. v. Miller', 40, ['Cruiser dashcam video', 'Breath-test calibration and maintenance records', 'Arresting officer notebook entries']],
    ['R. v. Tremblay', 62, ['911 call audio and dispatch CAD logs', 'Will-say statement, civilian witness']],
    ['R. v. Santos', 14, ['Arresting officer notebook entries', 'Property seizure log and locker receipts']],
    ['R. v. Chen', 70, ['Toxicology report, Centre of Forensic Sciences', 'Breath-test calibration and maintenance records']],
    ['R. v. Gauthier', 30, ['CCTV footage from the premises', 'Photographs of the scene']],
    ['R. v. Al-Mansoor', 42, ['Production order returns from the telecommunications provider', 'Chat log extraction report']],
    ['R. v. Kelly', 55, ['911 call audio and dispatch CAD logs', 'Will-say statement, civilian witness']],
  ];
  for (const [ref, age, items] of OTHER_REGISTERS) {
    await ingest({
      type: 'disclosure.request.sent', idempotency_key: `seed:req:${ref}`,
      occurred_at: at(back(age)),
      payload: { matter_ref: ref, channel: 'email', sent_at: at(back(age)),
        letter_ref: `DISC-${ref.split(' ').pop()!.toUpperCase()}-1`,
        items: items.map((d) => ({ description: d, category: 'other' })) },
    });
  }

  // ------------------------------------------------------ Okafor packages (3, messy names)
  await ingest({
    type: 'disclosure.package.received', idempotency_key: 'seed:pkg:okafor:1',
    occurred_at: at(back(60)),
    payload: {
      matter_ref: 'R. v. Okafor', source: 'portal', received_at: at(back(60)), label: 'March package',
      files: [
        { ...F('okafor_notebook_v1'), logical_key: 'okafor_notebook', hint: 'officer notebook Reyes memorandum book occurrence 26-114882' },
        { ...F('okafor_911'), hint: '911 dispatch CAD audio recording' },
        { ...F('okafor_witness'), hint: 'will-say witness statement transcription' },
      ],
    },
  });

  await ingest({
    type: 'disclosure.package.received', idempotency_key: 'seed:pkg:okafor:2',
    occurred_at: at(back(33)),
    payload: {
      matter_ref: 'R. v. Okafor', source: 'email', received_at: at(back(33)), label: 'May package',
      files: [{ ...F('okafor_calibration'), hint: 'intoxilyzer breath calibration maintenance certificate' }],
    },
  });

  await ingest({
    type: 'disclosure.package.received', idempotency_key: 'seed:pkg:okafor:3',
    occurred_at: at(back(2)),
    payload: {
      matter_ref: 'R. v. Okafor', source: 'usb', received_at: at(back(2)), label: 'June re-served package',
      files: [
        // Same logical document, re-served: drives the diff engine.
        { ...F('okafor_notebook_v2'), logical_key: 'okafor_notebook', hint: 'officer notebook Reyes memorandum book occurrence 26-114882' },
        // Never requested. Extras matter.
        { ...F('okafor_roster'), hint: 'divisional shift roster listing units and hours' },
      ],
    },
  });

  // Packages for a couple of other matters so the desk is not a single-matter demo.
  await ingest({
    type: 'disclosure.package.received', idempotency_key: 'seed:pkg:miller:1',
    occurred_at: at(back(20)),
    payload: { matter_ref: 'R. v. Miller', source: 'portal', received_at: at(back(20)), label: 'Initial package',
      files: [ { ...F('miller_dashcam'), hint: 'cruiser dashcam video unit 214' },
               { ...F('generic_photos'), hint: 'photographs of scene and property' } ] },
  });
  await ingest({
    type: 'disclosure.package.received', idempotency_key: 'seed:pkg:kelly:1',
    occurred_at: at(back(35)),
    payload: { matter_ref: 'R. v. Kelly', source: 'email', received_at: at(back(35)), label: 'Initial package',
      files: [ { ...F('okafor_911'), hint: '911 dispatch CAD audio recording' } ] },
  });

  // ------------------------------------------------- three prior follow-ups on the Okafor BWC item
  const bwc = await q(
    `SELECT ri.id FROM request_item ri JOIN matter m ON m.id=ri.matter_id
     WHERE m.matter_ref='R. v. Okafor' AND ri.seq=1`);
  for (const [i, age] of [80, 57, 30].entries()) {
    await q(`INSERT INTO followup (id,request_item_id,channel,sent_at,actor_id,note)
             VALUES ($1,$2,$3,$4,$5,$6)`,
      [id('fu'), bwc[0].id, i === 1 ? 'letter' : 'email', at(back(age)), LAWYER,
       `Follow-up ${i + 1} recorded on the request register`]);
  }
  await q(`UPDATE request_item SET last_followed_up_at=$1 WHERE id=$2`, [at(back(30)), bwc[0].id]);

  // ---------------------------------------------------------------- Ava conversations
  const friday = nextWeekday(today, 5);
  const CONVERSATIONS: { ref?: string; channel: string; ago: number; text: string; key: string }[] = [
    {
      key: 'miller-affidavit-v1', ref: 'R. v. Miller', channel: 'phone', ago: 4,
      text: `Sarah Miller called about R. v. Miller. She confirmed she has the surety paperwork. She said I'll send the signed affidavit by Wednesday. She also asked whether the consultation could move.`,
    },
    {
      // Same obligation, later information -> supersession chain, not an overwrite.
      key: 'miller-affidavit-v2', ref: 'R. v. Miller', channel: 'phone', ago: 1,
      text: `Sarah Miller called back about R. v. Miller. She said I'll send the signed affidavit by Friday instead, her brother is bringing the notary stamp. She confirmed the consultation stays as booked.`,
    },
    {
      key: 'okafor-court', ref: 'R. v. Okafor', channel: 'phone', ago: 2,
      text: `Court office called regarding R. v. Okafor. The bail hearing is listed for tomorrow morning in courtroom 402. Kelechi Okafor needs to file the surety form by ${addDays(today, 10)}.`,
    },
    {
      key: 'tremblay-detective', ref: 'R. v. Tremblay', channel: 'phone', ago: 1,
      // "next week" is a RANGE. No date is invented; this becomes NEEDS CONFIRMATION.
      text: `Luc Tremblay called about R. v. Tremblay. He asked me to call the lead investigator next week once the screening memo arrives.`,
    },
    {
      key: 'santos-bail', ref: 'R. v. Santos', channel: 'sms', ago: 0,
      // "tomorrow afternoon" resolves; "early next month" does not.
      text: `Ana Santos messaged about R. v. Santos. She wants to review the curfew condition tomorrow afternoon. She also said she will get the employment letter to us early next month.`,
    },
    {
      key: 'chen-consult', ref: 'R. v. Chen', channel: 'phone', ago: 0,
      text: `Wei Chen called about R. v. Chen. He booked a consultation for ${friday}. He asked us to call him back before court.`,
    },
    {
      key: 'kelly-followup', ref: 'R. v. Kelly', channel: 'phone', ago: 0,
      text: `Declan Kelly called about R. v. Kelly. He asked us to follow up with the Crown on Friday. He will bring the medical records in three days.`,
    },
    {
      key: 'okafor-today-court', ref: 'R. v. Okafor', channel: 'phone', ago: 0,
      text: `Court office called about R. v. Okafor. The bail hearing is listed for today at the courthouse. Kelechi Okafor will bring the surety documents today.`,
    },
    {
      key: 'miller-consult-today', ref: 'R. v. Miller', channel: 'phone', ago: 0,
      text: `Sarah Miller called about R. v. Miller. She confirmed the consultation is today. She said she will call the office back this afternoon with the surety details.`,
    },
    {
      key: 'tremblay-crown-today', ref: 'R. v. Tremblay', channel: 'email', ago: 0,
      text: `The Crown office wrote about R. v. Tremblay. We need to follow up with the Crown today about the screening memo.`,
    },
    {
      key: 'unknown-caller', channel: 'phone', ago: 0,
      // No matter can be resolved. Flagged, never guessed.
      text: `A caller left a message. He said he will drop the paperwork off sometime Friday. He did not give a file number or a full name.`,
    },
    {
      key: 'gauthier-vague', ref: 'R. v. Gauthier', channel: 'phone', ago: 0,
      // Genuinely undatable. Creates nothing; raises a review item.
      text: `Pierre Gauthier called about R. v. Gauthier. He said he would send the receipts soon.`,
    },
  ];

  for (const c of CONVERSATIONS) {
    await ingest({
      type: 'ava.conversation.completed', idempotency_key: `seed:conv:${c.key}`,
      channel: c.channel, occurred_at: at(back(c.ago), '16:42:00'),
      payload: { matter_ref: c.ref, channel: c.channel, occurred_at: at(back(c.ago), '16:42:00'), transcript: c.text },
    });
  }

  // ---------------------------------------------------------------- write-back
  const swept = await sweep();

  const counts = await q(`SELECT
    (SELECT count(*) FROM matter) matters,
    (SELECT count(*) FROM commitment) commitments,
    (SELECT count(*) FROM commitment WHERE status='needs_confirmation') needs_confirmation,
    (SELECT count(*) FROM commitment WHERE status='superseded') superseded,
    (SELECT count(*) FROM request_item) request_items,
    (SELECT count(*) FROM package) packages,
    (SELECT count(*) FROM dfile) files,
    (SELECT count(*) FROM classification) classifications,
    (SELECT count(*) FROM match) matches,
    (SELECT count(*) FROM diff) diffs,
    (SELECT count(*) FROM unmatched_file) unmatched,
    (SELECT count(*) FROM review_item WHERE status='open') open_reviews,
    (SELECT count(*) FROM action_proposal WHERE status='pending') pending_proposals,
    (SELECT count(*) FROM provenance) provenance_rows,
    (SELECT count(*) FROM run) runs`);
  return { today, ...counts[0], sweep_created: swept.proposals_created };

}
