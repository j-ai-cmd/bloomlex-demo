/**
 * OBLIGATION CLOCK — deterministic. Every number shown in the UI originates here.
 */
import { q } from '../db.js';
import { businessDaysBetween, calendarDaysBetween, todayInTz, ISODate } from './time.js';

const asDate = (v: any): ISODate =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export type ItemClock = {
  request_item_id: string;
  description: string;
  state: string;
  first_requested_at: string;
  age_calendar_days: number;
  age_business_days: number;
  followups: number;
  last_followed_up_at: string | null;
  packages_received: number;
  satisfied_at: string | null;
};

export async function itemClocks(matterId?: string): Promise<ItemClock[]> {
  const today = todayInTz();
  const rows = await q(
    `SELECT ri.*,
       (SELECT count(*) FROM followup f WHERE f.request_item_id = ri.id) AS followups,
       (SELECT count(DISTINCT d.package_id) FROM match m JOIN dfile d ON d.id = m.file_id
         WHERE m.request_item_id = ri.id AND m.state = 'confirmed') AS packages_received
     FROM request_item ri
     ${matterId ? 'WHERE ri.matter_id = $1' : ''}
     ORDER BY ri.seq`,
    matterId ? [matterId] : [],
  );
  return rows.map((r) => {
    const from = asDate(r.first_requested_at);
    const to = r.satisfied_at ? asDate(r.satisfied_at) : today;
    return {
      request_item_id: r.id,
      description: r.description,
      state: r.state,
      first_requested_at: from,
      age_calendar_days: calendarDaysBetween(from, to),
      age_business_days: businessDaysBetween(from, to),
      followups: Number(r.followups),
      last_followed_up_at: r.last_followed_up_at ? asDate(r.last_followed_up_at) : null,
      packages_received: Number(r.packages_received),
      satisfied_at: r.satisfied_at ? asDate(r.satisfied_at) : null,
    };
  });
}

export async function matterRollup(matterId: string) {
  const items = await itemClocks(matterId);
  return rollup(items);
}

export async function firmRollup() {
  const items = await itemClocks();
  return rollup(items);
}

function rollup(items: ItemClock[]) {
  const outstanding = items.filter((i) => !['Satisfied', 'Refused'].includes(i.state));
  const oldest = outstanding.reduce<ItemClock | null>((acc, i) => (!acc || i.age_calendar_days > acc.age_calendar_days ? i : acc), null);
  return {
    total_items: items.length,
    satisfied: items.filter((i) => i.state === 'Satisfied').length,
    partially_received: items.filter((i) => i.state === 'Partially Received').length,
    still_outstanding: items.filter((i) => i.state === 'Requested' || i.state === 'Acknowledged' || i.state === 'Follow-up Recommended').length,
    refused: items.filter((i) => i.state === 'Refused').length,
    needs_review: items.filter((i) => i.state === 'Needs Review').length,
    oldest_outstanding_days: oldest?.age_calendar_days ?? 0,
    oldest_outstanding_item: oldest?.description ?? null,
    total_followups: items.reduce((n, i) => n + i.followups, 0),
  };
}
