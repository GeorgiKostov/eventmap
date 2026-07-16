import { NextResponse } from 'next/server';
import { CHANNELS, getChannel, weekendWindow } from '../../../../lib/city-channels.js';
import { MIN_INDEXABLE_ITEMS } from '../../../../lib/digest.js';
import { listDigestPages } from '../../../../lib/db.js';
import { isAdmin } from '../../../../lib/admin-auth.js';

// Backend for the admin Pages desk (app/admin/pages/page.js) — George: "a view
// of all published blog/newsletter based pages so I can review and copy their
// links". Every frozen weekly digest snapshot (lib/digest.js) already IS a
// public page (app/weekend/[city]/[weekend]); this route just lists them with
// the facts George needs to decide what to do with each one.
export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');

// The send ledger (app/api/admin/digest/route.js `sentKey`) is written as a
// bare `new Date().toISOString()` today — not JSON. Parse defensively anyway:
// never let an unexpected ledger shape (a legacy JSON-wrapped value, say) 500
// this desk over a display field.
function parseSentAt(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') return parsed.at || parsed.sentAt || null;
    return null;
  } catch {
    return raw; // the current, plain-ISO-string format
  }
}

export async function GET(req) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = await listDigestPages();
  // Current weekend per channel, computed once rather than per row.
  const currentFriday = new Map(CHANNELS.map((c) => [c.slug, weekendWindow(c.tz).friday]));

  const pages = rows
    .map((r) => {
      let snapshot;
      try {
        snapshot = JSON.parse(r.value);
      } catch {
        return null; // corrupt snapshot — drop the row rather than crash the whole desk
      }
      const channel = getChannel(r.slug);
      const itemCount = snapshot.items?.length || 0;
      return {
        slug: r.slug,
        // A channel can in principle be retired from lib/city-channels.js while
        // its old snapshots remain in `meta` — fall back to the raw slug rather
        // than crash.
        city: channel?.label || r.slug,
        handle: channel?.handle || null,
        friday: r.friday,
        label: snapshot.label || r.friday,
        url: `${BASE}/weekend/${r.slug}/${r.friday}`,
        cityUrl: `${BASE}/weekend/${r.slug}`,
        itemCount,
        // MUST mirror the weekend page's own noindex rule (MIN_INDEXABLE_ITEMS,
        // shared from lib/digest.js) — this badge would lie otherwise.
        indexed: itemCount >= MIN_INDEXABLE_ITEMS,
        subject: snapshot.subject || null,
        copyModel: snapshot.copyModel || null,
        sentAt: parseSentAt(r.sentAt),
        postedIg: !!r.postedIg,
        postedFb: !!r.postedFb,
        isCurrent: !!channel && currentFriday.get(r.slug) === r.friday,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ pages });
}
