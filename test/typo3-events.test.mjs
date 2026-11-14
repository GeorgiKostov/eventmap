import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTypo3Events } from '../lib/typo3-events.js';

const src = (url, town) => ({ url, town });

// ---- T1: tx_news used as an event list ----
// Hermagor: schema.org Event with an explicit startDate.
const hermagor = `<div class="col-news-article"><div class="article articletype-0 topnews" itemscope="itemscope" itemtype="http://schema.org/Event" itemprop="event"><div class="row">
<p class="date"><time itemprop="startDate" datetime="2026-11-14T09:00">
 Sa
 14.11.2026 - 09:00 bis 12:00 Uhr
</time></p><div class="header"><h3><a title="Repair Cafe" href="/freizeit-tourismus/veranstaltungskalender/details/repair-cafe-5/"><span itemprop="headline">Repair Cafe</span></a></h3></div>
<div class="teaser-text"><div itemprop="description"><p>Hermagor, mittlerer Stadtsaal (prose, never copied)</p></div></div></div></div>
<div class="article articletype-0" itemscope="itemscope" itemtype="http://schema.org/Event" itemprop="event"><div class="row">
<p class="date"><time itemprop="startDate" datetime="2026-12-04T12:00"> Fr 04.12.2026 - 12:00 bis Sa 05.12.2026 - 18:00 </time></p>
<div class="header"><h3><a title="Opening" href="/details/opening/"><span itemprop="headline">Opening Beats Travel</span></a></h3></div></div></div></div>`;

test('tx_news Event items with itemprop=startDate are events', () => {
  const ev = parseTypo3Events(hermagor, src('https://hermagor.at/freizeit-tourismus/veranstaltungskalender/', 'Hermagor'));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].title, 'Repair Cafe');
  assert.equal(ev[0].date_start, '2026-11-14');
  assert.equal(ev[0].time_start, '09:00');
  assert.equal(ev[0].time_end, '12:00');
  assert.equal(ev[0].town, 'Hermagor');
  assert.equal(ev[0].description, null);
  assert.equal(ev[0].venue, null);
  assert.equal(ev[0].source_url, 'https://hermagor.at/freizeit-tourismus/veranstaltungskalender/details/repair-cafe-5/');
  assert.equal(ev[1].date_end, '2026-12-05');
  assert.equal(ev[1].time_end, null);
});

// Real news markup that must NOT become events (publish dates only).
const news = `
<div class="article articletype-1" itemscope="itemscope" itemtype="https://schema.org/Article"><div class="header"><h3>
<a itemprop="url" title="Impftermine Februar und März 2026" target="_blank" href="/fileadmin/Veranstaltungen/2026_Veranstaltungen/Impftermine_FSME.pdf"><span itemprop="headline">Impftermine Februar und März 2026</span></a></h3></div>
<div class="footer"><p><span class="news-list-date"><time itemprop="datePublished" datetime="2026-01-29">29.01.2026</time></span></p></div></div>
<div class="article articletype-0" itemscope="itemscope" itemtype="https://schema.org/Article"><div class="header"><h3>
<a title="Heizkostenzuschuss" itemprop="url" href="/aktuelles/termine/mitteilungen/artikel/heizkostenzuschuss/"><span itemprop="headline">Heizkostenzuschuss - Land und Gemeinde</span></a></h3></div>
<div class="footer"><p><span class="news-list-date"><time itemprop="datePublished" datetime="2026-10-01T14:42:00+02:00">01.10.2026</time></span></p></div></div>
<div class="article articletype-0" itemscope="itemscope" itemtype="https://schema.org/Article"><div class="header"><h3>
<a title="Lamatouren" href="/veranstaltungen/veranstaltung/news/detail/News/lamatouren/"><span itemprop="headline">Wunderschöne Lamatouren</span></a></h3></div>
<div class="footer"><span class="news-list-date"><time datetime="2026-04-01"><meta itemprop="datePublished" content="2026-04-01" /> 01.04.2026 </time></span></div></div>`;

test('plain tx_news items with only a publish date are never events', () => {
  assert.deepEqual(parseTypo3Events(news, src('https://example.gv.at/veranstaltungen', 'X')), []);
});

// Steiermark Gemeinde style: the news date IS the event date and the list shows a clock time.
const vaso = `<div class="article articletype-0" itemscope="itemscope" itemtype="http://schema.org/Article"><a title="Kegelnachmittag" href="/buergerinnen-service/veranstaltungskalender/detail/kegelnachmittag-1-543"><div class="row"><div class="col news-list-date"><time itemprop="datePublished" datetime="2026-11-06">
 06.11.2026</br>14:00 Uhr
</time></div><div class="col news-text"><div class="news-header"><h3><span itemprop="headline">Kegelnachmittag</span></h3></div></div>
<div class="col news-place"><div class="news-inner-place">
 GH Teschl/Hirschenwirt
</div></div></div></a></div>`;

test('datePublished used as event date is accepted only with a displayed clock time', () => {
  const [e] = parseTypo3Events(vaso, src('https://www.vasoldsberg.gv.at/buergerinnen-service/veranstaltungskalender', 'Vasoldsberg'));
  assert.equal(e.title, 'Kegelnachmittag');
  assert.equal(e.date_start, '2026-11-06');
  assert.equal(e.time_start, '14:00');
  assert.equal(e.venue, 'GH Teschl/Hirschenwirt');
  assert.equal(e.source_url, 'https://www.vasoldsberg.gv.at/buergerinnen-service/veranstaltungskalender/detail/kegelnachmittag-1-543');
});

const koeflach = `<div class="article articletype-0" itemscope="itemscope" itemtype="http://schema.org/Article"><div class="date"><span class="news-list-date"><time datetime="2026-11-17">
 Di, 17. November
 <meta itemprop="datePublished" content="2026-11-17" /></time></span></div><div class="kopf"><h3><a title="Blutspendetermin" href="freizeit/veranstaltungen/?tx_news_pi1%5Bnews%5D=1799&amp;cHash=aa7d"><span itemprop="headline">Blutspendetermin</span></a></h3></div></div>
<div class="article articletype-0" itemscope="itemscope" itemtype="http://schema.org/Article"><div class="date"><span class="news-list-date"><time datetime="2026-11-18">
 Mo, 18. November
 <meta itemprop="datePublished" content="2026-11-18" /></time></span></div><div class="kopf"><h3><a title="Falscher Wochentag" href="x/"><span itemprop="headline">Falscher Wochentag</span></a></h3></div></div>`;

test('weekday-led date must agree with the attribute (Di 17.11.2026 yes, Mo 18.11.2026 no)', () => {
  const ev = parseTypo3Events(koeflach, src('https://www.koeflach.at/freizeit/veranstaltungen/', 'Köflach'));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Blutspendetermin');
  assert.equal(ev[0].date_start, '2026-11-17');
  assert.equal(ev[0].time_start, null);
});

// ---- T2: event-wrap (Burgenland Gemeinde template) ----
const wrap = `
<div class="event-wrap clearfix "><a href="/tourismus/veranstaltungen/detail/adventbasar">
 <div class="event-start"><div class="event-start-day"> 13. Nov. 2026 </div><div class="event-start-day"> bis 14. Nov. 2026 </div></div>
 <div class="event-teaser"><div class="event-teaser-title">Adventbasar im Gesundheitsforum</div><div class="event-teaser-shortdesc">Freitag und Samstag</div></div></a></div>
<div class="event-wrap clearfix "><a href="/tourismus/veranstaltungen/detail/kein-datum">
 <div class="event-start"><div class="event-start-day"> nach Vereinbarung </div></div>
 <div class="event-teaser"><div class="event-teaser-title">Ohne Datum</div></div></a></div>`;

test('event-wrap: date range across two start-day divs; entry without a date is skipped', () => {
  const ev = parseTypo3Events(wrap, src('https://www.grosspetersdorf.at/tourismus/veranstaltungen', 'Großpetersdorf'));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Adventbasar im Gesundheitsforum');
  assert.equal(ev[0].date_start, '2026-11-13');
  assert.equal(ev[0].date_end, '2026-11-14');
  assert.equal(ev[0].source_url, 'https://www.grosspetersdorf.at/tourismus/veranstaltungen/detail/adventbasar');
});

// stretched-link style: the anchor precedes the block (and must not leak to the previous one)
const stretched = `
<div class="col"><a class="stretched-link" title="A" href="/veranstaltungen/detail/a/"></a>
<div class="event-wrap row"><div class="event-start"><span class="event-start-day"> 06.12.2026 </span></div>
<div><span class="event-teaser"><span class="event-teaser-title">Nikolofeier</span></span><br><span>Feuerwehrhaus 16.00 Uhr</span></div></div></div>
<div class="col"><a class="stretched-link" title="B" href="/veranstaltungen/detail/b/"></a>
<div class="event-wrap row"><div class="event-start"><span class="event-start-day"> 20.12.2026 </span></div>
<div><span class="event-teaser"><span class="event-teaser-title">Spaziergang</span></span></div></div></div>`;

test('event-wrap: stretched-link anchors map to their own block', () => {
  const ev = parseTypo3Events(stretched, src('https://www.schandorf.at/veranstaltungen/', 'Schandorf'));
  assert.deepEqual(ev.map((e) => [e.title, e.source_url]), [
    ['Nikolofeier', 'https://www.schandorf.at/veranstaltungen/detail/a/'],
    ['Spaziergang', 'https://www.schandorf.at/veranstaltungen/detail/b/'],
  ]);
  assert.equal(ev[0].time_start, '16:00');
});

// ---- T4: eventteaser (<time> is the LAST day of a multi-day entry) ----
const listitem = `
<article class="listitem listitem--eventteaser item-odd"><header><time datetime="14-11-26" class="listitem__date">Samstag, 14.11.2026</time><h4>Familien-Flohmarkt</h4></header>
<div class="listitem__content"><div class="listitem__teaser listitem__teaser--eventteaser"><p>Samstag, 14. November 2026, 10.00-15.00 Uhr (Kultursaal Debant)</p></div></div></article>
<article class="listitem listitem--eventteaser item-even"><header><time datetime="22-11-26" class="listitem__date">Sonntag, 22.11.2026</time><h4>Larvenausstellung</h4></header>
<div class="listitem__content"><div class="listitem__teaser listitem__teaser--eventteaser"><p>Freitag, 20. bis Sonntag, 22. November 2026 (Pitterl Stadl)</p></div></div></article>`;

test('eventteaser: single-day entries only; multi-day entry (shown with its last day) is skipped', () => {
  const ev = parseTypo3Events(listitem, src('https://www.nussdorf-debant.at/veranstaltungen', 'Nußdorf-Debant'));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Familien-Flohmarkt');
  assert.equal(ev[0].time_start, '10:00');
  assert.equal(ev[0].time_end, '15:00');
  assert.equal(ev[0].source_url, null);
});

// ---- T5: Vorarlberg cards ----
const card = `<div class="card "><div class="card-section"><div class="text-wrapper"><a aria-label="x" href="/veranstaltung/2026-11-16-expertin-vor-ort-stillberatung" target="_self"><div class="text"><p class="small"><span class="date">16.11.2026, 08:30&ndash;<span class="nowrap">12:00 Uhr</span></span><span class="category">Beratung</span></p>
<h1 class="show-for-sr">Expertin vor Ort: Stillberatung</h1><h1 class="hyphenate" aria-hidden="true">Expertin vor Ort: Stillberatung</h1><p>prose</p></div></a></div></div></div>`;

test('Vorarlberg cards: date, time range, linkback', () => {
  const [e] = parseTypo3Events(card, src('https://familienzentrum.dornbirn.at/veranstaltungen', 'Dornbirn'));
  assert.equal(e.title, 'Expertin vor Ort: Stillberatung');
  assert.equal(e.date_start, '2026-11-16');
  assert.equal(e.time_start, '08:30');
  assert.equal(e.time_end, '12:00');
  assert.equal(e.source_url, 'https://familienzentrum.dornbirn.at/veranstaltung/2026-11-16-expertin-vor-ort-stillberatung');
});

test('empty / unrelated html returns nothing', () => {
  assert.deepEqual(parseTypo3Events('', src('https://x.at/', 'X')), []);
  assert.deepEqual(parseTypo3Events('<p>14.11.2026 Fest</p>', src('https://x.at/', 'X')), []);
});
