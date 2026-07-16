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
import { sourceTier } from './source-quality.js';
import { CATS } from './icons.js';

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
    share: 'Diese Tipps als Webseite teilen ↗',
    ongoing: (endDay) => `läuft noch bis ${endDay}`,
    captionIntro: (city, label) => `Was geht am Wochenende (${label}) rund um ${city}? Unsere Picks für Familien:`,
    captionOutro: (url) => `Alle Infos, Karte & mehr Events:\n${url}`,
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
    share: 'Сподели тези идеи като страница ↗',
    ongoing: (endDay) => `продължава до ${endDay}`,
    captionIntro: (city, label) => `Какво се случва през уикенда (${label}) около ${city}? Нашият избор за семейства:`,
    captionOutro: (url) => `Всичко на картата:\n${url}`,
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
    share: 'Share these picks as a web page ↗',
    ongoing: (endDay) => `runs until ${endDay}`,
    captionIntro: (city, label) => `What’s on this weekend (${label}) around ${city}? Our family picks:`,
    captionOutro: (url) => `Everything on the map:\n${url}`,
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

// What to PRINT as the date. An event that started before this weekend but runs
// through it is legitimately pickable (the window test is an overlap — see
// weekendPicks), but printing its ORIGINAL start date puts a date in the PAST on
// the card and in the mail: "So 12.7." in a mail sent on the 16th reads as broken.
// For those, print the end instead — that is the fact the reader needs ("still on
// until Sunday"), and it is a fact we hold, not a guess.
function whenLabel(ev, window, lang) {
  const c = copy(lang);
  const startDay = String(ev.starts_at || '').slice(0, 10);
  const endDay = String(ev.ends_at || '').slice(0, 10);
  if (startDay >= window.from || !endDay) return formatWhen(ev.starts_at, ev.all_day, lang);
  const [y, m, d] = endDay.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return c.ongoing(`${c.weekdays[dow]} ${d}.${m}.`);
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

// How many picks a digest carries. NOT a fixed number: a weekend with twelve good
// family events should not be squeezed into five, and a thin weekend must not be
// padded up to ten with events we don't believe in — a weak pick costs more trust
// than a missing one, and the reader has no way to tell the difference.
//
// So the length is quality-gated: every pick above DIGEST_MIN must still clear the
// product's own lens (family fit). We stop at the first one that doesn't, and we
// never exceed DIGEST_MAX (Instagram allows 10 carousel slides = 1 cover + 9).
export const DIGEST_MIN = 5;
export const DIGEST_MAX = 9;

// The one selection+copy step every asset shares. `now` is injectable for tests.
// `exclude` carries the ids George has dropped this weekend, so a Regenerate
// can't resurrect a pick he vetoed.
export async function buildDigest(channel, { limit = DIGEST_MAX, now = new Date(), ai = true, exclude = [] } = {}) {
  const window = weekendWindow(channel.tz, now);
  const label = weekendLabel(window, channel.lang);
  const dropped = new Set((exclude || []).map(String));
  const pool = (await weekendPicks({
    lat: channel.lat,
    lng: channel.lng,
    radiusKm: channel.radiusKm,
    from: window.from,
    to: window.to,
    limit: limit + dropped.size + DIGEST_MIN, // headroom for vetoes + the fallback tail
  })).filter((e) => !dropped.has(String(e.id)));

  // weekendPicks already ranks family-first (lexicographic), so the family events
  // are a prefix of the pool. Take all of them, up to the cap. If the weekend is
  // thin on family events, top up from the rest rather than mailing two lines —
  // but only up to DIGEST_MIN, so a quiet weekend reads as short, not as padded.
  const family = pool.filter((e) => isForKids(e)).slice(0, limit);
  const picks = family.length >= DIGEST_MIN
    ? family
    : [...family, ...pool.filter((e) => !isForKids(e))].slice(0, DIGEST_MIN);

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
        when: whenLabel(e, window, channel.lang),
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
    when: whenLabel(e, window, channel.lang),
    // Raw machine dates, kept alongside the human label: the public weekend page
    // emits schema.org Event JSON-LD, and `when` ("läuft noch bis So 30.8.") is
    // prose, not a date. Google reads these.
    startsAt: e.starts_at || null,
    endsAt: e.ends_at || null,
    venue: e.venue || e.town || '',
    town: e.town || '',
    badges: eventBadges(e, channel.lang),
    cat: e.categories?.[0] || 'family',
    teaser: teaserById.get(String(e.id)) || e.description || '',
    url: `${BASE}/event/${e.id}`,
    // Source-quality (lib/source-quality.js — George's "rate official sources
    // higher" ask). NEW fields: snapshots frozen before this change won't carry
    // them, so any consumer must treat both as optional.
    source: e.source_name || null,
    tier: sourceTier(e),
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
  return loadDigestFor(channel, friday);
}

// Load a SPECIFIC weekend's frozen digest — the current one or any past one.
// This is what makes the public weekend page (and its archive) possible without
// storing anything new: the snapshot we already freeze for the newsletter IS the
// page. `friday` is the ISO Friday of the weekend ("2026-07-17").
export async function loadDigestFor(channel, friday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(friday || '')) return null;
  const raw = await metaGet(snapKey(channel.slug, friday));
  if (!raw) return null;
  return { ...JSON.parse(raw), channel };
}

export async function saveDigest(digest) {
  const { channel, ...rest } = digest;
  await metaSet(snapKey(channel.slug, digest.window.friday), JSON.stringify(rest));
  return digest;
}

export async function loadOrBuildDigest(channel, { force = false, limit = DIGEST_MAX, now = new Date() } = {}) {
  const existing = await loadDigest(channel, { now });
  if (existing && !force) return existing;
  // A forced rebuild still honours the ids George dropped this weekend.
  return saveDigest(await buildDigest(channel, { limit, now, exclude: existing?.droppedIds || [] }));
}

// The public page for this weekend — the link we hand out. Same content as the
// mail and the carousel, but it unfurls in a group chat and Google can read it.
export function weekendUrl(digest) {
  return `${BASE}/weekend/${digest.channel.slug}/${digest.window.friday}`;
}

// ---- newsletter ----

const utm = (url, medium, campaign) =>
  `${url}${url.includes('?') ? '&' : '?'}utm_source=okolo&utm_medium=${medium}&utm_campaign=${campaign}`;

export function renderNewsletter(digest, { unsubscribeUrl, mapUrl } = {}) {
  const { channel, items, label } = digest;
  const c = copy(channel.lang);
  const campaign = `weekend-${digest.window.friday}`;
  const map = mapUrl || `${BASE}/?lat=${channel.lat}&lng=${channel.lng}`;
  // SINGLE quotes around 'Segoe UI' — this string is interpolated into
  // double-quoted HTML style="…" attributes, and a double quote inside would
  // terminate the attribute early and silently drop every declaration after it
  // (which is exactly what happened: the whole mail rendered as unstyled serif).
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  // Each pick is a card with a CATEGORY-COLOURED rule + numbered chip — the same
  // grammar as the social cards and the map pins, so the three surfaces read as
  // one system (design-system.md: category colour comes from CATS, never a hex).
  // Tables + inline styles, because Outlook still doesn't do flexbox.
  const rows = items
    .map((it, i) => {
      const color = CATS[it.cat]?.color || ACCENT;
      const badges = it.badges.length
        ? `<div style="margin-top:10px">${it.badges
            .map(
              (b) =>
                `<span style="display:inline-block;font:700 11px/1 ${FONT};color:#fff;background:${color};border-radius:99px;padding:6px 10px;margin:0 4px 4px 0">${esc(b)}</span>`,
            )
            .join('')}</div>`
        : '';
      return `
      <tr><td style="padding:0 0 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border-left:5px solid ${color}">
          <tr>
            <td style="padding:18px 20px">
              <a href="${utm(it.url, 'email', campaign)}" style="text-decoration:none;color:${INK};display:block">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="width:30px;vertical-align:top">
                    <div style="width:26px;height:26px;border-radius:99px;background:${color};color:#fff;font:700 14px/26px ${FONT};text-align:center">${i + 1}</div>
                  </td>
                  <td style="vertical-align:top;padding-left:12px">
                    <div style="font:700 18px/1.3 ${FONT};color:${INK}">${esc(it.title)}</div>
                    <div style="font:700 13px/1.5 ${FONT};color:${color};margin-top:4px">${esc(it.when)}${it.venue ? `<span style="color:${MUTED};font-weight:400"> · ${esc(it.venue)}</span>` : ''}</div>
                    ${it.teaser ? `<div style="font:400 14px/1.55 ${FONT};color:${MUTED};margin-top:7px">${esc(it.teaser)}</div>` : ''}
                    ${badges}
                  </td>
                </tr></table>
              </a>
            </td>
          </tr>
        </table>
      </td></tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="${channel.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(digest.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(digest.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:24px 12px">
  <tr><td align="center">

    <!-- header: accent block, the same brand moment as the carousel cover.
         The wordmark is the CITY handle (okolo.linz), not the bare brand — the
         mail should read as "your city's channel", and the handle is what the
         reader can find on Instagram. -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${ACCENT};border-radius:16px">
      <tr><td style="padding:28px 26px 26px">
        <div style="font:700 22px/1 ${FONT};color:#fff">okolo<span style="opacity:.75">${esc(channel.handle.replace(/^okolo/, ''))}</span></div>
        <div style="font:700 13px/1 ${FONT};color:#fff;opacity:.85;margin-top:18px;letter-spacing:.5px">${esc(c.picksTitle(channel.label))}</div>
        <div style="font:700 30px/1.15 ${FONT};color:#fff;margin-top:6px">${esc(label)}</div>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="font:400 15px/1.6 ${FONT};color:${MUTED};padding:20px 4px 18px">${esc(digest.intro)}</td></tr>
      ${rows}
      <tr><td align="center" style="padding:10px 0 6px">
        <a href="${utm(map, 'email', campaign)}" style="display:inline-block;background:${INK};color:#fff;font:700 15px/1 ${FONT};text-decoration:none;border-radius:10px;padding:15px 26px">${esc(c.more)} →</a>
      </td></tr>
      <tr><td align="center" style="padding:14px 0 0">
        <a href="${utm(weekendUrl(digest), 'email', campaign)}" style="font:600 13px/1.5 ${FONT};color:${ACCENT};text-decoration:none">${esc(c.share)}</a>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;padding:18px 26px">
      <tr><td style="font:400 12px/1.6 ${FONT};color:#8A938F;text-align:center">
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
    ...items.map((it, i) =>
      [`${i + 1}. ${it.title}`, `   ${it.when}${it.venue ? ` · ${it.venue}` : ''}`, it.teaser ? `   ${it.teaser}` : null, `   ${utm(it.url, 'email', campaign)}`]
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
    c.captionOutro(weekendUrl(digest)),
    '',
    [...channel.hashtags, '#okolo'].join(' '),
  ].join('\n');
}

// Single-event caption for the per-item post (Thursday desk "post one" path).
// Same facts+linkback contract as renderCaption: the item's own teaser is our
// description (never invent), and it shares captionOutro so both captions send
// the reader to the exact same weekend URL.
export function renderItemCaption(digest, item) {
  const { channel } = digest;
  const c = copy(channel.lang);
  const factLine = `${item.when}${item.venue ? ` · ${item.venue}` : ''}${item.badges?.includes(c.free) ? ` · ${c.free}` : ''}`;
  const lines = [`📍 ${item.title}`, factLine];
  if (item.teaser) lines.push(item.teaser);
  return [
    ...lines,
    '',
    c.captionOutro(weekendUrl(digest)),
    '',
    [...channel.hashtags, '#okolo'].join(' '),
  ].join('\n');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
