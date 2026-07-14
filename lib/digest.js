// Weekly digest assembly: DB picks → the three assets the growth engine needs
// (newsletter HTML, social caption, card payloads). Deterministic by default;
// the AI copywriter (lib/extract.js → writeDigestCopy, Sonnet) only ever adds
// the subject/intro/teaser PROSE on top of facts we already hold.
//
// Two rules this file exists to enforce:
//   1. The newsletter must render with zero AI (template fallback) — a growth
//      loop that breaks when a model call 429s is not a loop.
//   2. Every event fact shown comes from the DB row, never from the model
//      (hard rule 5). Teasers are validated back against the pick ids; a line
//      for an id we didn't send is dropped, not printed.

import { weekendWindow, weekendLabel } from './city-channels.js';
import { weekendPicks, metaGet, metaSet } from './db.js';
import { writeDigestCopy } from './extract.js';
import { isForKids } from './kid-cats.js';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');
const ACCENT = '#C93A5B';
const INK = '#212B28';
const MUTED = '#4A5652';
const PAPER = '#F2F2EE';

const T = {
  de: {
    picksTitle: (city) => `Die Top-Picks rund um ${city}`,
    free: 'gratis',
    kids: 'für Kinder',
    indoor: 'drinnen',
    outdoor: 'draußen',
    more: 'Alle Events auf der Karte',
    unsub: 'Abmelden',
    why: 'Du bekommst diese E-Mail, weil du dich für den Okolo-Wochenend-Newsletter angemeldet und die Anmeldung bestätigt hast.',
    subjectFallback: (city, label) => `Familien-Wochenende in ${city}: ${label}`,
    introFallback: (city, n) => `Wir haben ${n} Ideen für dein Wochenende rund um ${city} zusammengesucht — von gratis bis besonders.`,
    ageFrom: (a) => `ab ${a} J.`,
    timeTbd: 'Zeit folgt',
    captionIntro: (city, label) => `Was geht am Wochenende (${label}) rund um ${city}? Unsere Picks für Familien:`,
    captionOutro: 'Alle Infos, Karte & mehr Events: okolo.events',
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  },
  bg: {
    picksTitle: (city) => `Топ избор около ${city}`,
    free: 'безплатно',
    kids: 'за деца',
    indoor: 'на закрито',
    outdoor: 'на открито',
    more: 'Всички събития на картата',
    unsub: 'Отписване',
    why: 'Получаваш този имейл, защото се абонира за уикенд бюлетина на Okolo и потвърди абонамента си.',
    subjectFallback: (city, label) => `Семеен уикенд в ${city}: ${label}`,
    introFallback: (city, n) => `Събрахме ${n} идеи за уикенда около ${city} — от безплатни до специални.`,
    ageFrom: (a) => `от ${a} г.`,
    timeTbd: 'без час',
    captionIntro: (city, label) => `Какво се случва през уикенда (${label}) около ${city}? Нашият избор за семейства:`,
    captionOutro: 'Всичко на картата: okolo.events',
    weekdays: ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  },
  en: {
    picksTitle: (city) => `Top picks around ${city}`,
    free: 'free',
    kids: 'for kids',
    indoor: 'indoor',
    outdoor: 'outdoor',
    more: 'See every event on the map',
    unsub: 'Unsubscribe',
    why: 'You’re getting this because you signed up for the Okolo weekend newsletter and confirmed your subscription.',
    subjectFallback: (city, label) => `Family weekend in ${city}: ${label}`,
    introFallback: (city, n) => `${n} ideas for your weekend around ${city} — from free to special.`,
    ageFrom: (a) => `${a}+`,
    timeTbd: 'time TBD',
    captionIntro: (city, label) => `What’s on this weekend (${label}) around ${city}? Our family picks:`,
    captionOutro: 'Everything on the map: okolo.events',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
};

const copy = (lang) => T[lang] || T.en;

// starts_at is a LOCAL wall-clock string ("2026-07-18T10:00") — parse it as
// fields, never through Date's timezone machinery (hard rule 3).
export function formatWhen(startsAt, allDay, lang) {
  const c = copy(lang);
  const [date, time] = String(startsAt || '').split('T');
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const day = `${c.weekdays[dow]} ${d}.${m}.`;
  if (allDay) return day; // genuinely runs all day
  if (!time) return `${day} · ${c.timeTbd}`; // date-only = time UNKNOWN, not all-day — don't conflate
  return lang === 'bg' ? `${day} ${time.slice(0, 5)} ч.` : `${day} ${time.slice(0, 5)}`;
}

export function eventBadges(ev, lang) {
  const c = copy(lang);
  const out = [];
  if (ev.is_free) out.push(c.free);
  // age_min 0 means "no lower bound", not "from age zero" — a card reading
  // "от 0 г." / "ab 0 J." is nonsense. Only a real floor earns the age badge.
  if (isForKids(ev)) out.push(ev.age_min > 0 ? c.ageFrom(ev.age_min) : c.kids);
  if (ev.indoor === 1) out.push(c.indoor);
  else if (ev.indoor === 0) out.push(c.outdoor);
  return out;
}

// The one selection+copy step every asset shares. `now` is injectable for tests.
// `exclude` carries the ids George has dropped this weekend, so a Regenerate
// can't resurrect a pick he vetoed.
export async function buildDigest(channel, { limit = 5, now = new Date(), ai = true, exclude = [] } = {}) {
  const window = weekendWindow(channel.tz, now);
  const label = weekendLabel(window, channel.lang);
  const dropped = new Set((exclude || []).map(String));
  const picks = (await weekendPicks({
    lat: channel.lat,
    lng: channel.lng,
    radiusKm: channel.radiusKm,
    from: window.from,
    to: window.to,
    limit: limit + dropped.size, // refill the slots the vetoed picks would have taken
  })).filter((e) => !dropped.has(String(e.id))).slice(0, limit);

  const c = copy(channel.lang);
  let written = null;
  if (ai && picks.length) {
    written = await writeDigestCopy({
      city: channel.label,
      lang: channel.lang,
      weekendLabel: label,
      events: picks.map((e) => ({
        id: String(e.id),
        title: e.title,
        when: formatWhen(e.starts_at, e.all_day, channel.lang),
        venue: e.venue || null,
        town: e.town || null,
        is_free: e.is_free === 1,
        age_min: e.age_min ?? null,
        age_max: e.age_max ?? null,
        indoor: e.indoor === 1 ? true : e.indoor === 0 ? false : null,
        categories: e.categories,
        description: e.description || null,
      })),
    });
  }

  // A teaser is only used if the model returned it for an id we actually sent.
  const teaserById = new Map(
    (written?.teasers || [])
      .filter((t) => t && t.id && typeof t.line === 'string')
      .map((t) => [String(t.id), t.line.trim()]),
  );

  const items = picks.map((e) => ({
    id: String(e.id),
    title: e.title,
    when: formatWhen(e.starts_at, e.all_day, channel.lang),
    venue: e.venue || e.town || '',
    town: e.town || '',
    badges: eventBadges(e, channel.lang),
    cat: e.categories?.[0] || 'family',
    teaser: teaserById.get(String(e.id)) || e.description || '',
    url: `${BASE}/event/${e.id}`,
  }));

  return {
    channel,
    window,
    label,
    items,
    droppedIds: [...dropped], // persisted so Regenerate keeps honouring the vetoes
    // The provider that actually wrote this copy ('claude-sonnet-5', a Gemini
    // model, or null = deterministic template). Never assume Sonnet ran.
    copyModel: written?.model || null,
    subject: written?.subject?.trim() || c.subjectFallback(channel.label, label),
    intro: written?.intro?.trim() || c.introFallback(channel.label, items.length),
  };
}

// Drop a vetoed pick from a frozen snapshot WITHOUT re-running the AI: filter it
// out, remember it, and fall the intro back to the deterministic line so the
// prose can't keep claiming the pre-drop count (the AI intro may name it).
export function applyDrop(digest, id) {
  const c = copy(digest.channel.lang);
  const items = digest.items.filter((it) => it.id !== String(id));
  return {
    ...digest,
    items,
    droppedIds: [...new Set([...(digest.droppedIds || []), String(id)])],
    intro: c.introFallback(digest.channel.label, items.length),
  };
}

// ---- weekly snapshot ----
// The digest is built ONCE per city per weekend and frozen into `meta`. Every
// downstream asset (preview, the 6 social cards, the caption, the newsletter
// send) then reads that one snapshot, so the cards can't disagree with the
// email, and a card request can't re-trigger a paid AI call. Regenerating is an
// explicit act (`force`), and George's edits (dropping a bad pick) persist.
const snapKey = (slug, friday) => `digest:${slug}:${friday}`;

export async function loadDigest(channel, { now = new Date() } = {}) {
  const { friday } = weekendWindow(channel.tz, now);
  const raw = await metaGet(snapKey(channel.slug, friday));
  if (!raw) return null;
  const snap = JSON.parse(raw);
  return { ...snap, channel };
}

export async function saveDigest(digest) {
  const { channel, ...rest } = digest;
  await metaSet(snapKey(channel.slug, digest.window.friday), JSON.stringify(rest));
  return digest;
}

export async function loadOrBuildDigest(channel, { force = false, limit = 5, now = new Date() } = {}) {
  const existing = await loadDigest(channel, { now });
  if (existing && !force) return existing;
  // A forced rebuild still honours the ids George dropped this weekend.
  return saveDigest(await buildDigest(channel, { limit, now, exclude: existing?.droppedIds || [] }));
}

// ---- newsletter ----

const utm = (url, medium, campaign) =>
  `${url}${url.includes('?') ? '&' : '?'}utm_source=okolo&utm_medium=${medium}&utm_campaign=${campaign}`;

export function renderNewsletter(digest, { unsubscribeUrl, mapUrl } = {}) {
  const { channel, items, label } = digest;
  const c = copy(channel.lang);
  const campaign = `weekend-${digest.window.friday}`;
  const map = mapUrl || `${BASE}/?lat=${channel.lat}&lng=${channel.lng}`;

  const rows = items
    .map(
      (it) => `
      <tr><td style="padding:0 0 22px">
        <a href="${utm(it.url, 'email', campaign)}" style="text-decoration:none;color:${INK}">
          <div style="font:700 17px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;color:${INK}">${esc(it.title)}</div>
          <div style="font:600 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${ACCENT};margin-top:3px">${esc(it.when)}${it.venue ? ` · ${esc(it.venue)}` : ''}</div>
          ${it.teaser ? `<div style="font:400 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};margin-top:5px">${esc(it.teaser)}</div>` : ''}
          ${it.badges.length ? `<div style="margin-top:7px">${it.badges.map((b) => `<span style="display:inline-block;font:600 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};background:${PAPER};border-radius:99px;padding:5px 9px;margin-right:5px">${esc(b)}</span>`).join('')}</div>` : ''}
        </a>
      </td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html lang="${channel.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(digest.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(digest.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;padding:30px 26px">
      <tr><td style="font:800 22px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:${INK};padding-bottom:2px">okolo<span style="color:${ACCENT}">.</span></td></tr>
      <tr><td style="font:700 19px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${INK};padding:16px 0 0">${esc(c.picksTitle(channel.label))}</td></tr>
      <tr><td style="font:600 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:${ACCENT};padding:3px 0 0">${esc(label)}</td></tr>
      <tr><td style="font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};padding:12px 0 24px">${esc(digest.intro)}</td></tr>
      ${rows}
      <tr><td style="padding:6px 0 4px">
        <a href="${utm(map, 'email', campaign)}" style="display:inline-block;background:${ACCENT};color:#fff;font:700 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;border-radius:9px;padding:13px 20px">${esc(c.more)} →</a>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;padding:16px 26px">
      <tr><td style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#8A938F;text-align:center">
        ${esc(c.why)}<br>
        <a href="${unsubscribeUrl}" style="color:#8A938F;text-decoration:underline">${esc(c.unsub)}</a> · <a href="${BASE}/impressum" style="color:#8A938F;text-decoration:underline">Impressum</a> · <a href="${BASE}/datenschutz" style="color:#8A938F;text-decoration:underline">${channel.lang === 'bg' ? 'Поверителност' : 'Datenschutz'}</a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  const text = [
    digest.subject,
    '',
    digest.intro,
    '',
    ...items.map((it) =>
      [`• ${it.title}`, `  ${it.when}${it.venue ? ` · ${it.venue}` : ''}`, it.teaser ? `  ${it.teaser}` : null, `  ${utm(it.url, 'email', campaign)}`]
        .filter(Boolean)
        .join('\n'),
    ),
    '',
    `${c.more}: ${utm(map, 'email', campaign)}`,
    '',
    c.why,
    `${c.unsub}: ${unsubscribeUrl}`,
  ].join('\n');

  return { subject: digest.subject, html, text };
}

// ---- social caption ----

export function renderCaption(digest) {
  const { channel, items, label } = digest;
  const c = copy(channel.lang);
  const lines = items.map(
    (it) => `📍 ${it.title} — ${it.when}${it.venue ? `, ${it.venue}` : ''}${it.badges.includes(c.free) ? ` (${c.free})` : ''}`,
  );
  return [
    c.captionIntro(channel.label, label),
    '',
    ...lines,
    '',
    c.captionOutro,
    '',
    [...channel.hashtags, '#okolo'].join(' '),
  ].join('\n');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
