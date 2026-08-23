import { validDateOf } from './event-time.js';

const COPY = {
  BG: { locale: 'bg-BG', at: 'в', on: 'на' },
  AT: { locale: 'de-AT', at: 'in', on: 'am' },
  DE: { locale: 'de-DE', at: 'in', on: 'am' },
};

// Original, deterministic, facts-only fallback for structured sources. It
// improves empty summaries without copying publisher prose or invoking a model.
export function eventSummary(ev) {
  if (ev?.description) return ev.description;
  if (!ev?.title) return '';
  const copy = COPY[ev.country] || { locale: 'en', at: 'at', on: 'on' };
  const place = ev.venue || ev.town;
  const day = validDateOf(ev.starts_at);
  const date = day
    ? new Intl.DateTimeFormat(copy.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${day}T12:00:00Z`)).replace(/[.\s]+$/, '')
    : null;
  return `${ev.title}${place ? ` ${copy.at} ${place}` : ''}${date ? ` ${copy.on} ${date}` : ''}.`;
}
