/**
 * Generates the mock PDFs and media stubs used by the seed and draggable into the demo.
 *
 * The PDFs are real: page counts, embedded producer strings and modification dates are
 * read back out of the files by the fingerprinter. Per-page text and redaction rectangles
 * are written to a sidecar because we authored these documents and therefore know them;
 * for a file dragged in whose sidecar we do not have, the diff engine reports fewer
 * observations rather than inventing any.
 *
 * Media stubs carry a declared duration in their sidecar. Real media probing, and any
 * semantic comparison of audio or video, is explicitly out of scope.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../../../../fixtures/generated/', import.meta.url);
const dir = fileURLToPath(OUT);

type PageSpec = { text: string; redactions?: [number, number, number, number][] };

async function makePdf(name: string, pages: PageSpec[], meta: { producer: string; modDate: Date; title: string }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  pages.forEach((p, i) => {
    const page = doc.addPage([612, 792]);
    page.drawText(meta.title, { x: 48, y: 740, size: 11, font: bold });
    page.drawText(`Page ${i + 1} of ${pages.length}`, { x: 460, y: 740, size: 9, font });
    page.drawLine({ start: { x: 48, y: 730 }, end: { x: 564, y: 730 }, thickness: 0.5 });
    const lines = p.text.match(/.{1,86}(\s|$)/g) ?? [p.text];
    lines.forEach((l, j) => page.drawText(l.trim(), { x: 48, y: 700 - j * 15, size: 10, font }));
    for (const [x, y, w, h] of p.redactions ?? []) {
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(0, 0, 0) });
    }
    page.drawText('DEMO DATA — NO REAL CLIENT INFORMATION', { x: 48, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  });
  doc.setProducer(meta.producer);
  doc.setCreator('Spine fixture generator');
  doc.setTitle(meta.title);
  doc.setModificationDate(meta.modDate);
  doc.setCreationDate(meta.modDate);
  await writeFile(`${dir}${name}`, await doc.save());
  return {
    filename: name,
    mime: 'application/pdf',
    sidecar: {
      pages: pages.map((p, i) => ({ page: i + 1, text: p.text, redactions: (p.redactions ?? []).map((r) => [...r]) })),
    },
  };
}

async function makeMediaStub(name: string, mime: string, duration_s: number, note: string) {
  // A byte stub, not real media. Real media probing is out of scope and stated as such.
  const body = Buffer.from(`SPINE-MEDIA-STUB\n${name}\nduration_s=${duration_s}\n${note}\n`);
  await writeFile(`${dir}${name}`, body);
  return { filename: name, mime, sidecar: { duration_s } };
}

const NOTEBOOK_PAGES = (opts: { includePage4: boolean; redactPage6: boolean; dropTransport?: boolean }): PageSpec[] => {
  const base: PageSpec[] = [
    { text: '02:02 Dispatched to reported vehicle stop, eastbound arterial. Unit 1421 acknowledged.' },
    { text: '02:10 Vehicle stopped. White sedan, two occupants. Plate recorded in CAD.' },
    { text: '02:14 Driver produced licence. Identification recorded. Passenger remained seated.' },
    { text: '02:18 Roadside screening device serial TPS-409 retrieved from cruiser locker. Pre-shift test log consulted.' },
    { text: '02:25 Screening demand read from card. Sample provided at 02:27.' },
    { text: '02:31 Radioed dispatch for secondary unit. Rear cargo area observed from exterior.' },
    { text: '02:40 Transport commenced to 52 Division. Odometer recorded.' },
    { text: '03:10 Arrival at booking counter. Property inventory commenced with booking officer.' },
    { text: '03:22 Rights to counsel read a second time at booking. Response recorded.' },
    { text: '03:40 Breath technician attended. Instrument identified by serial number.' },
    { text: '04:05 Samples completed. Certificate printed and attached to file.' },
    { text: '04:30 Subject released on undertaking. Copy of documents provided.' },
  ];
  let pages = base;
  if (!opts.includePage4) pages = base.filter((_, i) => i !== 3);
  // A third serving drops the transport entry as well, so the demo package produces real
  // observations against what is already on file rather than an identical re-send.
  if (opts.dropTransport) pages = pages.filter((p) => !p.text.startsWith('02:40'));
  if (opts.redactPage6) {
    const idx = pages.findIndex((p) => p.text.startsWith('02:31'));
    if (idx >= 0) pages[idx] = { ...pages[idx], redactions: [[48, 640, 300, 14], [48, 620, 240, 14], [48, 600, 280, 14]] };
  }
  return pages;
};

await mkdir(dir, { recursive: true });

const manifest = {
  okafor_notebook_v1: await makePdf('SCAN_0091.pdf', NOTEBOOK_PAGES({ includePage4: true, redactPage6: false }), {
    producer: 'Division Scanner Gen4', modDate: new Date('2026-03-12T14:02:00Z'),
    title: 'MEMORANDUM BOOK — OFFICER ENTRIES',
  }),
  okafor_notebook_v2: await makePdf('Discl_pkg3_FINAL_v2.pdf', NOTEBOOK_PAGES({ includePage4: false, redactPage6: true }), {
    producer: 'Acrobat Pro Extension 24.1', modDate: new Date('2026-06-10T09:15:00Z'),
    title: 'MEMORANDUM BOOK — OFFICER ENTRIES',
  }),
  okafor_notebook_v3: await makePdf('supp_pkg_scan.pdf', NOTEBOOK_PAGES({ includePage4: false, redactPage6: true, dropTransport: true }), {
    producer: 'Acrobat Pro Extension 24.3', modDate: new Date('2026-08-28T16:40:00Z'),
    title: 'MEMORANDUM BOOK — OFFICER ENTRIES',
  }),
  okafor_witness: await makePdf('DOC_0031.pdf', [
    { text: 'Statement of civilian witness regarding line of sight at the intersection. Typed transcription attached to audio.' },
    { text: 'Witness confirms position at the north-west corner and describes vehicle direction of travel.' },
  ], { producer: 'Division Scanner Gen4', modDate: new Date('2026-03-20T10:00:00Z'), title: 'WITNESS STATEMENT — TRANSCRIPTION' }),
  okafor_calibration: await makePdf('scan001.pdf', [
    { text: 'Annual bench inspection certificate for breath instrument. Calibration and maintenance record attached.' },
  ], { producer: 'Division Scanner Gen4', modDate: new Date('2026-08-02T11:00:00Z'), title: 'INSTRUMENT CALIBRATION AND MAINTENANCE RECORD' }),
  okafor_roster: await makePdf('Officer_shift_roster_Div14.pdf', [
    { text: 'Divisional shift roster listing assigned units and hours for the reporting period.' },
  ], { producer: 'Division Scanner Gen4', modDate: new Date('2026-06-09T08:00:00Z'), title: 'DIVISIONAL SHIFT ROSTER' }),
  okafor_911: await makeMediaStub('aud_0417.mp3', 'audio/mpeg', 1284, '911 call audio and dispatch recording'),
  miller_dashcam: await makeMediaStub('IMG_4471.mp4', 'video/mp4', 862, 'cruiser dashcam video'),
  generic_photos: await makePdf('IMG_0042.pdf', [
    { text: 'Photograph contact sheet. Images of the scene and of seized property as inventoried.' },
  ], { producer: 'Division Scanner Gen4', modDate: new Date('2026-04-11T09:00:00Z'), title: 'PHOTOGRAPH CONTACT SHEET' }),
};

await writeFile(`${dir}manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`fixtures written to ${dir} (${Object.keys(manifest).length} files)`);
