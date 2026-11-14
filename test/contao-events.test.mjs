import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContaoEvents } from '../lib/contao-events.js';

const src = { url: 'https://www.wiener-neustadt.at/de/veranstaltungen', town: 'Wiener Neustadt' };

// Real NÖ "eventapi" markup (Wiener Neustadt), trimmed. Includes: a normal card,
// a 00:00 placeholder time, a no-date card, and an image-only stub card.
const eventApi = `<base href="https://www.wiener-neustadt.at/">
<div class="ce_wp_noe_eventapi_list event-list ce_noeevent_box def">
<div
class="event-list--card event-list-item first">
<div class="flex-row"><div class="flex-column col-first">
<a class="" href="de/stadt/eventreader/237106---christian-flora-birgit-schweiger"><figure><img src="x.jpg" alt=""></figure></a></div>
<div class="flex-column col-last">
<a class="" href="de/stadt/eventreader/237106---christian-flora-birgit-schweiger">
<h2 itemprop="name no-directlinks">CHRISTIAN FLORA &amp; BIRGIT SCHWEIGER</h2>
<div class="ce_text">Source prose that must never be copied …</div>
<div class="dates_tickets"><ul class="listing dates"><li class="padding-bottom first last">
<i class="fal fa-calendar"></i> Fr, 06.11.2026
<div class="event_time"><i class="fal fa-clock"></i> <span class="small-info">00:00 - 00:00</span></div>
<br>mehr »</li></ul></div></a></div></div></div>
<div
class="event-list--card event-list-item">
<div class="flex-row"><div class="flex-column col-last">
<a class="" href="de/stadt/eventreader/236249---hollywood-night">
<h2 itemprop="name no-directlinks">Hollywood Night</h2>
<div class="dates_tickets"><ul class="listing dates"><li class="padding-bottom first last">
<i class="fal fa-calendar"></i> Do, 26.11.2026
<div class="event_time"><span class="small-info">19:00 - 21:30</span></div>
<!-- <a href="https://tickets.example/x">Tickets</a> --><span>Online Ticket-Link verfügbar</span>
</li></ul></div></a></div></div></div>
<div
class="event-list--card event-list-item">
<div class="flex-row"><div class="flex-column col-last">
<a class="" href="de/stadt/eventreader/999---ohne-datum">
<h2 itemprop="name no-directlinks">Kein Datum</h2>
<div class="dates_tickets"><ul class="listing dates"><li>auf Anfrage</li></ul></div></a></div></div></div>
<div class="event-list--card event-list-item last"><div class="flex-row"><div class="flex-column col-first"><figure><picture></picture></figure></div></div></div>
</div>`;

test('eventapi cards: facts only, linkback resolved, 00:00 placeholder is no time', () => {
  const ev = parseContaoEvents(eventApi, src);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].title, 'CHRISTIAN FLORA & BIRGIT SCHWEIGER');
  assert.equal(ev[0].date_start, '2026-11-06');
  assert.equal(ev[0].time_start, null);
  assert.equal(ev[0].time_end, null);
  assert.equal(ev[0].source_url, 'https://www.wiener-neustadt.at/de/stadt/eventreader/237106---christian-flora-birgit-schweiger');
  assert.equal(ev[0].town, 'Wiener Neustadt');
  assert.equal(ev[0].description, null);
  assert.deepEqual(ev[0].categories, []);
  assert.equal(ev[1].date_start, '2026-11-26');
  assert.equal(ev[1].time_start, '19:00');
  assert.equal(ev[1].time_end, '21:30');
});

test('eventapi cards: no-date and image-only stub cards are skipped, never guessed', () => {
  const ev = parseContaoEvents(eventApi, src);
  assert.ok(!ev.some((e) => /Kein Datum/.test(e.title)));
});

test('eventapi: two-digit year ranges collapse to a single day when start == end', () => {
  const html = `<div class="event-list--card event-list-item"><a href="de/a/event-detail/1---x"><h2>Jazz</h2></a>
    <ul class="listing dates"><li><i></i> 18.4.27 - 18.4.27</li></ul></div>`;
  const [e] = parseContaoEvents(html, src);
  assert.equal(e.date_start, '2027-04-18');
  assert.equal(e.date_end, null);
});

// Real Contao mod_eventlist teaser grid (Montforthaus), trimmed.
const teaser = `<div class="mod_eventlist block"><div class="row">
<div class="event event-test event-hidden layout_teaser current cal_1 col-12" data-tags="Musik," data-location="Montforthaus" data-month="November" data-year="2026">
<a href="/de/events-mon/event/in-the-blink-of-an-eye" title="x"><div class="content-text block"><h2>in the blink of an eye</h2>
<p>Teaser prose</p><p class="time"><time datetime="2026-11-14T19:00:00+01:00" itemprop="startDate"><span>14.11.2026</span><span>ab 19:00</span></time></p></div></a></div>
<div class="event event-test layout_teaser upcoming cal_1" data-location="Montforthaus">
<a href="/de/events-mon/event/firmenfeier-8"><div class="content-text block"><h2>Firmenfeier</h2>
<p class="time"><time datetime="2026-11-17" itemprop="startDate"><span>17.11.2026 bis 18.11.2026</span></time></p></div></a></div>
<div class="event layout_teaser cal_1 col-12 event-hidden event-not-found"><div class="content-text"><h2>Keine Veranstaltungen gefunden</h2></div></div>
</div></div>`;

test('teaser grid: ISO datetime gives date+time, text gives range, placeholder card skipped', () => {
  const ev = parseContaoEvents(teaser, { url: 'https://montforthausfeldkirch.com/de/besuchen/eventkalender', town: 'Feldkirch' });
  assert.equal(ev.length, 2);
  assert.equal(ev[0].date_start, '2026-11-14');
  assert.equal(ev[0].time_start, '19:00');
  assert.equal(ev[0].venue, 'Montforthaus');
  assert.equal(ev[0].source_url, 'https://montforthausfeldkirch.com/de/events-mon/event/in-the-blink-of-an-eye');
  assert.equal(ev[1].date_start, '2026-11-17');
  assert.equal(ev[1].date_end, '2026-11-18');
  assert.equal(ev[1].time_start, null);
});

const week = `<div class="mod_eventlist eventlist"><div class="eventlist__day"><div class="eventlist__day-items">
<div class="event-week current even first cal_1"><p class="event-week__time"><time datetime="2026-11-14T10:30:00+01:00">10.30 <span>Uhr</span></time></p>
<div class="event-week__location">Bühne 1</div>
<div class="event-week__title-container"><h3 class="event-week__title"><a href="event/ausflug-utflukt" title="AUSFLUG">AUSFLUG/UTFLUKT</a></h3></div>
<div class="event-week__min-age">ab 4</div></div>
</div></div></div>`;

test('spielplan rows: relative detail link, stated minimum age', () => {
  const [e] = parseContaoEvents(week, { url: 'https://www.dschungelwien.at/spielplan', town: 'Wien' });
  assert.equal(e.title, 'AUSFLUG/UTFLUKT');
  assert.equal(e.date_start, '2026-11-14');
  assert.equal(e.time_start, '10:30');
  assert.equal(e.age_min, 4);
  assert.equal(e.source_url, 'https://www.dschungelwien.at/event/ausflug-utflukt');
});

test('unrelated or empty html returns nothing', () => {
  assert.deepEqual(parseContaoEvents('<html><body><h1>Gemeinde</h1><p>14.11.2026</p></body></html>', src), []);
  assert.deepEqual(parseContaoEvents('', src), []);
  assert.deepEqual(parseContaoEvents(null, src), []);
});
