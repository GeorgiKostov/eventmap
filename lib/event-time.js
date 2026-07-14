// How an event's start time is encoded — ONE definition, shared by the server
// (db/crawl/seed), the client list, and the digest.
//
// `starts_at` is a Vienna wall-clock TEXT string (hard rule 3). It comes in two
// shapes, and the shape IS the meaning:
//
//   "2026-07-19T16:00"  — the source published a time. 16 chars.
//   "2026-07-19"        — the source published NO time. 10 chars. We don't know.
//
// The bug this replaces: a missing time was written as `T09:00` and then flagged
// `all_day = true` (`all_day: time ? 0 : 1`, in both crawl.mjs and seed.mjs). Two
// fabrications for the price of one — hard rule 5 says an unknown field is null,
// never a guess:
//
//   · the stored 09:00 is a time nobody published. It stayed out of sight because
//     the UI short-circuits on all_day, but it is inside `content_hash`, it sorts
//     among real morning events, and it is what makes merge-dups.mjs delete a
//     genuine 18:30 row in favour of a placeholder (see tasks/todo.md).
//   · "ganztägig" is a CLAIM — it tells a parent they can turn up whenever. For
//     8,365 live events we had no basis for it; a 16:00 cinema screening is not
//     an all-day event. `all_day` is now set ONLY when a source or a user
//     actually says so, never inferred from silence.
//
// So: no time → store the date alone, and say nothing about the time.

export function hasTime(startsAt) {
  return typeof startsAt === 'string' && startsAt.length > 10;
}

// "2026-07-19T16:00" → "16:00"; "2026-07-19" → null. Never a default.
export function timeOf(startsAt) {
  return hasTime(startsAt) ? startsAt.slice(11, 16) : null;
}

export function dayOf(startsAt) {
  return (startsAt || '').slice(0, 10);
}

// Build a starts_at from a source's date + optional time. The ONE place a
// date and a time become a stored string, so a `|| '09:00'` cannot creep back.
export function makeStartsAt(date, time) {
  const t = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? time : null;
  return t ? `${date}T${t}` : date;
}

// Build an ends_at the same way. Same shape rule as starts_at: a known END DATE
// with no end time is stored date-only ("2026-12-31"), NOT dropped — dropping it
// (the old `time_end ? ... : null`) made a 10-month program expire after its
// first day, because expiry then fell back to end-of-START-day. A date-only
// ends_at is read as end-of-that-day in expireFinished(). `dateStart` is the
// fallback when the source gave a range with no explicit end date.
export function makeEndsAt(dateEnd, timeEnd, dateStart) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateEnd || '') ? dateEnd : dateStart;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const t = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeEnd || '') ? timeEnd : null;
  return t ? `${date}T${t}` : date;
}

// An event with no published time cannot be placed in a morning/afternoon/evening
// bucket, so it must not be filtered OUT by one — same treatment as all_day.
// (Silently bucketing it as "morning" is how a 09:00 placeholder became a lie.)
export function inTimeOfDay(ev, buckets) {
  if (!buckets || !buckets.length) return true;
  if (ev.all_day || !hasTime(ev.starts_at)) return true;
  const h = Number(ev.starts_at.slice(11, 13));
  const bucket = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return buckets.includes(bucket);
}
