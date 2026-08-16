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

// Strict calendar validation for read surfaces. Most write paths already
// require YYYY-MM-DD, but old/bad source rows such as "2026-08-XX" must not
// make Intl.DateTimeFormat or JSON-LD generation throw a RangeError. Returning
// null keeps the unknown date unknown instead of guessing.
export function validDateOf(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function validTimeOf(value) {
  if (!validDateOf(value)) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}T((?:[01]\d|2[0-3]):[0-5]\d)$/);
  return match ? match[1] : null;
}

// Extracts a leading "YYYY-MM-DD" and optional "HH:MM" from any ISO-ish
// datetime, discarding a trailing timezone offset/Z. Hard rule 3: storage is
// Vienna wall-clock, never a UTC conversion — so we take the literal digits
// as written rather than parsing through Date/UTC.
// (Lived in scripts/crawl.mjs until lib/microdata-events.js needed it too. It
// belongs here, next to makeStartsAt: this file is the one definition of how a
// source's date+time becomes our stored shape, and a second copy is how nine
// decodeEntities implementations happened — tasks/lessons.md 2026-07-14.)
export function splitLocalDateTime(iso) {
  if (!iso) return { date: null, time: null };
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] || null };
}

// "2026-07-19T16:00" → "16:00"; "2026-07-19" → null. Never a default.
export function timeOf(startsAt) {
  return hasTime(startsAt) ? startsAt.slice(11, 16) : null;
}

export function dayOf(startsAt) {
  return (startsAt || '').slice(0, 10);
}

// Whether an event had already begun when the active date lens starts. This is
// the same definition used by the list's "Ongoing" group: a multi-day event
// that overlaps the selected day/range but started before it. A future event or
// a one-day occurrence must never receive the badge.
export function isOngoingAt(ev, date) {
  const start = validDateOf(ev?.starts_at);
  const end = validDateOf(ev?.ends_at);
  const day = validDateOf(date);
  return !!(start && end && day && start < day && end >= day);
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
