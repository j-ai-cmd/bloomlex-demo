import React, { useEffect, useState } from 'react';

/**
 * Drop the real mark at apps/web/public/bloomlex-logo.svg (or .png) and it is used
 * automatically. Until then a plain wordmark stands in — a demo should never ship a
 * guessed-at version of somebody else's logo.
 */
export function Logo() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      for (const c of ['/bloomlex-logo.svg', '/bloomlex-logo.png']) {
        try { const r = await fetch(c, { method: 'HEAD' });
          if (r.ok && !String(r.headers.get('content-type')).includes('text/html')) { setSrc(c); return; } } catch {}
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-space-2xs">
      {src
        ? <img src={src} alt="BloomLex" className="h-7 w-auto object-contain object-left" />
        : (
          <span className="font-headline-matter text-[22px] font-bold tracking-tight text-on-surface leading-none">
            bloom<span className="text-accent">lex</span><span className="text-accent">.</span>
          </span>
        )}
    </div>
  );
}
