/**
 * A document fingerprint is the ONLY input to the diff engine. It contains observable
 * facts and nothing else.
 *
 * For PDFs the page count, hashes, producer and embedded timestamps are read from the
 * file itself. Per-page text and redaction rectangles are read from a sidecar emitted by
 * the fixture generator; for a file dragged in during the demo whose sidecar we do not
 * have, those fields are null and the diff engine simply reports fewer observations
 * rather than inventing any.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

export type PageFingerprint = { page: number; text: string | null; redactions: number[][] | null };
export type Fingerprint = {
  sha256: string;
  bytes: number;
  page_count: number | null;
  duration_s: number | null;
  producer: string | null;
  embedded_timestamp: string | null;
  pages: PageFingerprint[] | null;
  /** Explicitly stated so the UI can say what was NOT compared. */
  out_of_scope: string[];
};

export const OUT_OF_SCOPE = [
  'semantic video comparison',
  'semantic audio comparison',
  'handwriting OCR',
];

export async function fingerprintFile(path: string, sidecar?: any): Promise<Fingerprint> {
  const buf = await readFile(path);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const base: Fingerprint = {
    sha256, bytes: buf.length, page_count: null, duration_s: sidecar?.duration_s ?? null,
    producer: null, embedded_timestamp: null, pages: sidecar?.pages ?? null,
    out_of_scope: OUT_OF_SCOPE,
  };
  if (path.toLowerCase().endsWith('.pdf')) {
    try {
      const doc = await PDFDocument.load(buf, { updateMetadata: false });
      base.page_count = doc.getPageCount();
      base.producer = doc.getProducer() ?? null;
      const mod = doc.getModificationDate();
      base.embedded_timestamp = mod ? mod.toISOString() : null;
    } catch {
      // Unreadable PDF: report what we can (hash, bytes) and nothing we cannot.
    }
  }
  return base;
}
