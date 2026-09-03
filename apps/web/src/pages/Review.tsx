import React, { useEffect, useState } from 'react';
import { Icon, Pill, Button, Card, Empty } from '../lib/ui';

const INTAKE_KEY = 'bloomlex_intake_state';

type FileRecord = {
  id: string; filename: string; pages: number | null; docType: string | null;
  description: string; status: 'flagged' | 'matched'; matchedItem: string | null;
};

function loadFlagged(): FileRecord[] {
  try {
    const raw = sessionStorage.getItem(INTAKE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (parsed.files ?? []).filter((f: FileRecord) => f.status === 'flagged');
  } catch { return []; }
}

export function Review({ onChanged }: { onChanged: () => void }) {
  const [flagged, setFlagged] = useState<FileRecord[]>([]);
  const [decided, setDecided] = useState<Record<string, 'added' | 'dismissed'>>({});

  useEffect(() => { setFlagged(loadFlagged()); }, []);

  function act(id: string, action: 'added' | 'dismissed') {
    setDecided((prev) => ({ ...prev, [id]: action }));
    onChanged();
  }

  const pending = flagged.filter((f) => !decided[f.id]);
  const done    = flagged.filter((f) =>  decided[f.id]);

  return (
    <div className="max-w-4xl mx-auto w-full px-space-xl py-space-xl flex flex-col gap-space-xl">

      <div>
        <h1 className="font-display-hero text-display-hero text-on-surface">Pending Review</h1>
        <p className="font-body-default text-body-default text-on-surface-variant max-w-2xl mt-space-sm">
          Documents the system could not match to an outstanding request. Review each one and decide whether to add it to the Disclosure Register or set it aside.
        </p>
      </div>

      {flagged.length === 0 && (
        <Empty>Nothing waiting for your review. Upload a disclosure package to get started.</Empty>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-space-md">
          <h2 className="font-headline-matter text-subhead-lead font-bold text-on-surface">
            {pending.length} document{pending.length > 1 ? 's' : ''} waiting
          </h2>
          {pending.map((f) => (
            <Card key={f.id} className="overflow-hidden">
              <div className="px-space-lg py-space-sm bg-status-awaiting-bg border-b border-status-awaiting-border flex flex-wrap items-center justify-between gap-space-xs">
                <span className="flex items-center gap-space-sm">
                  <Icon name="flag" className="text-[18px] text-status-awaiting-fg" />
                  <span className="font-body-strong text-body-strong text-status-awaiting-fg">
                    Could not be matched to a request
                  </span>
                </span>
                <Pill tone="awaiting">Needs your review</Pill>
              </div>

              <div className="p-space-lg flex flex-col gap-space-md">
                <div className="flex flex-col gap-space-2xs">
                  <span className="font-headline-matter font-bold text-body-strong text-on-surface">
                    {f.docType ?? 'Unidentified document'}
                  </span>
                  <span className="font-code-timestamp text-caption-meta text-on-surface-variant">
                    {f.filename}{f.pages ? ` · ${f.pages} pages` : ''}
                  </span>
                </div>

                <p className="font-body-compact text-body-compact text-on-surface-variant">{f.description}</p>

                <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs border-t border-surface-border">
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">
                    Decide what to do with this document. Your decision is logged.
                  </span>
                  <span className="flex items-center gap-space-sm">
                    <Button onClick={() => act(f.id, 'dismissed')}>Set aside</Button>
                    <Button variant="primary" onClick={() => act(f.id, 'added')}>
                      <Icon name="add" className="text-[16px]" /> Add to register
                    </Button>
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="flex flex-col gap-space-md">
          <h2 className="font-headline-matter text-subhead-lead font-bold text-on-surface">Decided</h2>
          <Card className="divide-y divide-surface-border">
            {done.map((f) => (
              <div key={f.id} className="px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md">
                <span className="flex flex-col">
                  <span className="font-body-strong text-body-strong text-on-surface">
                    {f.docType ?? 'Unidentified document'}
                  </span>
                  <span className="font-caption-meta text-caption-meta text-on-surface-variant">{f.filename}</span>
                </span>
                <Pill tone={decided[f.id] === 'added' ? 'satisfied' : 'neutral'}>
                  {decided[f.id] === 'added' ? 'Added to register' : 'Set aside'}
                </Pill>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
