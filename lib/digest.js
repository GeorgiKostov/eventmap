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
// Highlight ring colours — the same two the map pins use (app/page.js
// HIGHLIGHT_COLORS / --gold in globals.css), restated here because a mail is
// inline-styled hex only: no CSS variables survive an email client. Keep in sync.
// Editorial is the CI raspberry, i.e. ACCENT.
const HIGHLIGHT = { gold: '#E8A800', editorial: ACCENT };

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
    // The issue covers two strands now (SECTIONS), so the whole-issue framing is
    // "the weekend in ${city}" and the FAMILY promise lives on its own heading —
    // a "Familien-Wochenende" subject over a half-and-half list is the mismatch
    // the sections exist to remove. The AI usually writes these; this is the
    // zero-AI fallback and must say the same thing.
    subjectFallback: (city, label) => `Wochenende in ${city}: ${label}`,
    introFallback: (city, n) => `Wir haben ${n} Ideen für dein Wochenende rund um ${city} zusammengesucht — von gratis bis besonders.`,
    ageFrom: (a) => `ab ${a} J.`,
    timeTbd: 'Zeit folgt',
    share: 'Diese Tipps als Webseite teilen ↗',
    ongoing: (endDay) => `läuft noch bis ${endDay}`,
    // Must stay identical to i18n.js `adTag` — the reader meets the same word on
    // the map, in the list and here. Gold (paid) only, never editorial.
    adTag: 'Anzeige',
    // Strand headings (SECTIONS). "Für alle" rather than "Ohne Kinder": the
    // second strand isn't child-free-only, it's the stuff that doesn't need kids
    // to be worth going to — and a heading that defines an audience by what it
    // lacks reads badly to both halves of the list.
    secFamily: 'Für Familien',
    secAll: 'Für alle',
    captionIntro: (city, label) => `Was geht am Wochenende (${label}) rund um ${city}? Unsere Picks:`,
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
    subjectFallback: (city, label) => `Уикендът в ${city}: ${label}`,
    introFallback: (city, n) => `Събрахме ${n} идеи за уикенда около ${city} — от безплатни до специални.`,
    ageFrom: (a) => `от ${a} г.`,
    timeTbd: 'без час',
    share: 'Сподели тези идеи като страница ↗',
    ongoing: (endDay) => `продължава до ${endDay}`,
    adTag: 'Реклама',
    secFamily: 'За семейства',
    secAll: 'За всички',
    captionIntro: (city, label) => `Какво се случва през уикенда (${label}) около ${city}? Нашият избор:`,
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
    subjectFallback: (city, label) => `The weekend in ${city}: ${label}`,
    introFallback: (city, n) => `${n} ideas for your weekend around ${city} — from free to special.`,
    ageFrom: (a) => `${a}+`,
    timeTbd: 'time TBD',
    share: 'Share these picks as a web page ↗',
    ongoing: (endDay) => `runs until ${endDay}`,
    adTag: 'Sponsored',
    secFamily: 'For families',
    secAll: 'For everyone',
    captionIntro: (city, label) => `What’s on this weekend (${label}) around ${city}? Our picks:`,
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

// Group a digest's items into the labelled strands every renderer shows — the
// newsletter, the weekend page and the caption must agree, so this is the one
// place that decides when headings appear.
//
// Headings only when the issue genuinely HAS both strands: a lone "Für Familien"
// over the entire list is noise, and a snapshot frozen before sections existed
// carries no `section` at all and must render exactly as it was built (one flat
// list). Returned in SECTIONS order; `title` is null for the flat case.
export function sectionsOf(items, lang) {
  const c = copy(lang);
  const titles = { family: c.secFamily, all: c.secAll };
  const groups = SECTIONS
    .map((key) => ({ key, title: titles[key], items: items.filter((it) => it.section === key) }))
    .filter((g) => g.items.length);
  return groups.length > 1 ? groups : [{ key: null, title: null, items }];
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
// events should not be squeezed into five, and a thin weekend must not be padded
// out with events we don't believe in — a weak pick costs more trust than a
// missing one, and the reader has no way to tell the difference. What keeps the
// tail honest is the pool itself: weekendPicks already excludes reported events
// and gates community content (communityQualityGate), so every candidate here is
// one we stand behind; length is simply min(limit, what exists).
//
// DIGEST_MAX was 9 because Instagram allows 10 carousel slides (1 cover + 9).
// That is a POSTING limit, not an editorial one, and George asked for "10 best
// events from the area" — so the mail and the weekend page carry 10 and the
// carousel posts the cover + the first 9, saying which pick it left out
// (lib/social-publish.js cardUrls). A pick that misses the carousel can still go
// out via the desk's per-event post.
export const DIGEST_MIN = 5;
export const DIGEST_MAX = 10;

// Two labelled strands per issue (George, 2026-07-17: "almost every event is for
// kids… it's also aimed at young people without kids who want to explore art
// events, so maybe half half or so").
//
// The digest used to be ~100% family BY CONSTRUCTION: it took every family event
// first and only topped up from the rest when fewer than DIGEST_MIN existed, so
// any decent weekend produced an all-family list. Now each strand gets about half
// the issue and is labelled, so the family promise stays explicit AND the other
// half is honestly what it is — rather than a family banner over art events.
//
// "About half": if one strand is thin the other fills the gap, because mailing
// five when ten good things are happening serves nobody. An issue with only one
// strand renders with no headings at all (see sectionsOf) — a lone "Für Familien"
// heading over the whole list is noise.
export const SECTIONS = ['family', 'all'];

// How deep to pull the ranked pool before splitting it into strands. Not a
// display limit — it only has to be deeper than any plausible single-strand run
// at the top of a family-first ranking, so the "for everyone" strand always has
// real candidates to choose from. weekendPicks' `limit` is a JS slice over an
// already-fetched result set, so this is free.
const POOL_DEPTH = 200;

// Below this many picks, the public weekend page goes noindex (a doorway-farm
// guard — see app/weekend/[city]/[weekend]/page.js). Exported so the admin
// Pages desk can show the SAME "indexed" verdict without hardcoding a second 3.
export const MIN_INDEXABLE_ITEMS = 3;

// Split a RANKED pool into the issue's two strands: about half family, about
// half everything else, `limit` in total. Pure and exported so the arithmetic
// that decides what a reader actually receives is testable without a database.
//
// Order in, order out: `pool` arrives ranked (weekendPicks → rankPick), each
// strand keeps that relative order, and family leads because the sections render
// in SECTIONS order.
//
// "About half" — if one strand can't fill its share, the other takes the slack
// rather than shipping a five-item issue on a weekend with ten good things on.
// Both being short simply means a short issue: the pool is already quality-gated
// (reported events excluded, community content gated), so we never invent a tail.
export function splitSections(pool, limit) {
  const half = Math.ceil(limit / 2);
  const famPool = pool.filter((e) => isForKids(e));
  const allPool = pool.filter((e) => !isForKids(e));
  let famPicks = famPool.slice(0, half);
  let allPicks = allPool.slice(0, limit - half);
  // Second pass, in this order: grow family into whatever `all` left unclaimed,
  // then grow `all` against the family count we just settled on. Reversing these
  // two lines would size each strand against a stale count and overshoot `limit`.
  if (famPicks.length + allPicks.length < limit) {
    famPicks = famPool.slice(0, limit - allPicks.length);
    allPicks = allPool.slice(0, limit - famPicks.length);
  }
  return {
    picks: [...famPicks, ...allPicks],
    sectionOf: new Map([
      ...famPicks.map((e) => [String(e.id), 'family']),
      ...allPicks.map((e) => [String(e.id), 'all']),
    ]),
  };
}

// The ranked candidate pool for one channel+window — the single definition of
// "what could be in this issue". buildDigest picks from it; applyReplace draws
// the swap-in from the same list, so a replacement is chosen by exactly the
// ranking that chose the pick it replaces.
//
// The pool must be deep enough to hold BOTH strands. weekendPicks ranks
// family-first (rankPick's tuple), so asking for ~`limit` rows returns an
// all-family prefix and the "for everyone" strand would come back empty on
// exactly the weekends it matters most. `limit` there is a JS slice over rows
// the query has already fetched, so a deep pool costs one extra sort, not one
// extra query.
export async function poolFor(channel, window) {
  return weekendPicks({
    lat: channel.lat,
    lng: channel.lng,
    radiusKm: channel.radiusKm,
    from: window.from,
    to: window.to,
    limit: POOL_DEPTH,
  });
}

// One ranked row → one frozen item. Shared by buildDigest and applyReplace so a
// swapped-in pick is identical in SHAPE to a built one — a replacement that
// silently lacked `section` or `tier` would render as a different kind of row
// (no strand, no source line) in the mail, the page and the cards.
function toItem(e, { window, channel, section = null, teaser = null }) {
  return {
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
    teaser: teaser || e.description || '',
    url: `${BASE}/event/${e.id}`,
    // Source-quality (lib/source-quality.js — George's "rate official sources
    // higher" ask). NEW fields: snapshots frozen before this change won't carry
    // them, so any consumer must treat both as optional.
    source: e.source_name || null,
    tier: sourceTier(e),
    // 'gold' (paid) | 'editorial' (our showcase) | null, frozen at build time
    // like everything else here. Also optional on older snapshots.
    //
    // It did NOT affect which picks are above — see weekendPicks. Renderers must
    // treat the highlight TREATMENT and the „Anzeige" LABEL as one unit: gold may
    // never be styled without being labelled (that is exactly the "looks organic"
    // failure the compliance guardrails exist to prevent), which is why both come
    // from this single field rather than from two independent checks.
    highlight: e.highlight || null,
    // 'family' | 'all' — which labelled strand this pick belongs to (SECTIONS).
    // Optional like the fields above: snapshots frozen before sections existed
    // carry none, and sectionsOf() renders those as one flat list, exactly as
    // they were built.
    section: section || null,
  };
}

// The one selection+copy step every asset shares. `now` is injectable for tests.
// `exclude` carries the ids George has dropped this weekend, so a Regenerate
// can't resurrect a pick he vetoed.
export async function buildDigest(channel, { limit = DIGEST_MAX, now = new Date(), ai = true, exclude = [] } = {}) {
  const window = weekendWindow(channel.tz, now);
  const label = weekendLabel(window, channel.lang);
  const dropped = new Set((exclude || []).map(String));
  const pool = (await poolFor(channel, window)).filter((e) => !dropped.has(String(e.id)));

  const { picks, sectionOf } = splitSections(pool, limit);

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
        // Which strand this pick sits in. The prompt tells the model this field
        // exists and asks it to address BOTH audiences — so it has to actually
        // be here, or the prompt is describing a payload we never send.
        section: sectionOf.get(String(e.id)) || null,
      })),
    });
  }

  // A teaser is only used if the model returned it for an id we actually sent.
  const teaserById = new Map(
    (written?.teasers || [])
      .filter((t) => t && t.id && typeof t.line === 'string')
      .map((t) => [String(t.id), t.line.trim()]),
  );

  const items = picks.map((e) =>
    toItem(e, {
      window,
      channel,
      section: sectionOf.get(String(e.id)) || null,
      teaser: teaserById.get(String(e.id)),
    }),
  );

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

// Swap ONE pick for the next-best candidate — a veto that keeps the issue full,
// where applyDrop leaves it one shorter (George: "regenerate individually so we
// can replace them"). Pure: the caller supplies the ranked `pool` (poolFor).
//
// SAME STRAND, SAME SLOT. A family pick is replaced by the next family
// candidate, so the half-and-half split (splitSections) survives an edit —
// drawing the replacement from the whole pool would quietly turn "Für Familien"
// into a mixed list, which is the exact mismatch SECTIONS exists to remove. A
// pre-sections snapshot carries no strand, so anything in the pool fits.
//
// The vetoed id joins droppedIds, so it can't come back via Regenerate and a
// second Replace on the same slot keeps walking down the pool rather than
// offering the same event again.
//
// NO AI, like applyDrop: a click must not trigger a paid rebuild. The new row's
// teaser falls back to our own stored description (hard rule 1 — we write those
// ourselves), and the intro falls back to the deterministic line because the AI
// intro was written with the vetoed event in the list. "↻ Regenerate picks +
// copy" is still the way to get fresh AI prose, and it honours every veto.
//
// Returns null when nothing can be swapped in (unknown id, or the strand's pool
// is exhausted) — the caller reports that rather than silently doing nothing.
export function applyReplace(digest, id, pool) {
  const idx = digest.items.findIndex((it) => it.id === String(id));
  if (idx === -1) return null;
  const section = digest.items[idx].section || null;
  const inUse = new Set(digest.items.map((it) => it.id));
  const dropped = new Set([...(digest.droppedIds || []), String(id)]);
  const candidate = pool.find((e) => {
    const eid = String(e.id);
    if (inUse.has(eid) || dropped.has(eid)) return false;
    if (section === null) return true;
    return isForKids(e) === (section === 'family');
  });
  if (!candidate) return null;
  const c = copy(digest.channel.lang);
  const items = [...digest.items];
  items[idx] = toItem(candidate, { window: digest.window, channel: digest.channel, section });
  return {
    ...digest,
    items,
    droppedIds: [...dropped],
    intro: c.introFallback(digest.channel.label, items.length),
  };
}

// Move one pick up/down so George decides what leads (his "reorganize order"
// ask). Pure. `dir` is 'up' | 'down'.
//
// WITHIN ITS STRAND, because that is the only movement any renderer can show:
// the mail, the weekend page and the caption all group by section (sectionsOf),
// so swapping a family pick past an "all" pick would reorder the array and
// change nothing on screen. A pre-sections snapshot is one flat strand, so the
// same rule moves it freely. Strand blocks stay contiguous, which is what lets
// the desk enable the buttons purely from a pick's position in its own group.
//
// The intro is deliberately NOT reset (unlike drop/replace): the issue's events
// and their count are unchanged, and the AI intro describes the weekend overall
// rather than the running order (see digestPrompt in lib/extract.js).
//
// Returns null when the pick is already at its strand's edge — nothing to swap.
export function applyReorder(digest, id, dir) {
  const items = [...digest.items];
  const idx = items.findIndex((it) => it.id === String(id));
  if (idx === -1) return null;
  const step = dir === 'up' ? -1 : 1;
  const section = items[idx].section ?? null;
  let swap = idx + step;
  while (swap >= 0 && swap < items.length && (items[swap].section ?? null) !== section) swap += step;
  if (swap < 0 || swap >= items.length) return null;
  [items[idx], items[swap]] = [items[swap], items[idx]];
  return { ...digest, items };
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
  const card = (it, i) => {
      const color = CATS[it.cat]?.color || ACCENT;
      const badges = it.badges.length
        ? `<div style="margin-top:10px">${it.badges
            .map(
              (b) =>
                `<span style="display:inline-block;font:700 11px/1 ${FONT};color:#fff;background:${color};border-radius:99px;padding:6px 10px;margin:0 4px 4px 0">${esc(b)}</span>`,
            )
            .join('')}</div>`
        : '';
      // Highlight ring, mirroring the map pin: the highlight colour rings the
      // card while the category rule keeps the left edge (border-left is
      // declared after `border`, so it wins on that side and the two signals
      // coexist instead of one overwriting the other). Snapshots frozen before
      // `highlight` existed simply have none — hence the `|| null` guard.
      const hl = HIGHLIGHT[it.highlight] || null;
      const ring = hl ? `border:2px solid ${hl};` : '';
      // Gold is PAID and must carry the label wherever it carries the styling
      // (ECG §6 / MedienG §26 — colour alone is not disclosure). Editorial is our
      // own showcase, so it rings but is deliberately never labelled.
      const adTag = it.highlight === 'gold'
        ? `<span style="display:inline-block;font:800 10px/1 ${FONT};color:${INK};background:#FDF3DA;border:1px solid ${HIGHLIGHT.gold};border-radius:99px;padding:4px 8px;margin-left:8px;vertical-align:middle">${esc(c.adTag)}</span>`
        : '';
      return `
      <tr><td style="padding:0 0 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;${ring}border-left:5px solid ${color}">
          <tr>
            <td style="padding:18px 20px">
              <a href="${utm(it.url, 'email', campaign)}" style="text-decoration:none;color:${INK};display:block">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="width:30px;vertical-align:top">
                    <div style="width:26px;height:26px;border-radius:99px;background:${color};color:#fff;font:700 14px/26px ${FONT};text-align:center">${i + 1}</div>
                  </td>
                  <td style="vertical-align:top;padding-left:12px">
                    <div style="font:700 18px/1.3 ${FONT};color:${INK}">${esc(it.title)}${adTag}</div>
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
  };

  // Strand headings (see sectionsOf): rendered only when the issue has both, so
  // a single-strand weekend and every pre-sections frozen snapshot look exactly
  // as they did. Numbering runs 1..N across the whole issue, not per section —
  // "pick 6" must mean one thing in the mail, the caption and the carousel.
  let n = 0;
  const rows = sectionsOf(items, channel.lang)
    .map((g) => {
      const heading = g.title
        ? `<tr><td style="padding:8px 4px 10px"><div style="font:700 12px/1 ${FONT};color:${MUTED};letter-spacing:.09em;text-transform:uppercase">${esc(g.title)}</div></td></tr>`
        : '';
      return heading + g.items.map((it) => card(it, n++)).join('');
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

  // The text/plain alternative is the SAME mail — it gets the same strands and
  // the same continuous numbering as the HTML part, or a text-only client (and
  // every plain-text preview) silently sees a different, flatter newsletter.
  let tn = 0;
  const textItem = (it) =>
    [`${++tn}. ${it.title}`, `   ${it.when}${it.venue ? ` · ${it.venue}` : ''}`, it.teaser ? `   ${it.teaser}` : null, `   ${utm(it.url, 'email', campaign)}`]
      .filter(Boolean)
      .join('\n');
  const text = [
    digest.subject,
    '',
    digest.intro,
    '',
    ...sectionsOf(items, channel.lang).flatMap((g) =>
      g.title ? [`— ${g.title} —`, ...g.items.map(textItem), ''] : g.items.map(textItem),
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
  const line = (it) =>
    `📍 ${it.title} — ${it.when}${it.venue ? `, ${it.venue}` : ''}${it.badges.includes(c.free) ? ` (${c.free})` : ''}`;
  // Same strands as the mail and the page — a caption that said "our family
  // picks" over a half-and-half list would be the exact mismatch the sections
  // exist to remove. Blank line before each heading except the first.
  const lines = sectionsOf(items, channel.lang).flatMap((g, i) =>
    g.title ? [...(i ? [''] : []), `— ${g.title} —`, ...g.items.map(line)] : g.items.map(line),
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
