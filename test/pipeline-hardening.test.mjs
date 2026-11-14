// Pipeline hardening 2026-11-14: cancelled titles, address towns, GEM2GO va_list.
// Run: node --test test/pipeline-hardening.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCancelledTitle, uncancelledTitle, isCancelledStatus } from '../lib/cancellation.js';
import { addressTown, sameTown } from '../lib/address-town.js';
import { parseJsonLdEvents } from '../lib/jsonld-events.js';
import { parseGem2goEvents } from '../scripts/crawl.mjs';

test('cancelled titles are recognised, ordinary ones are not', () => {
  for (const t of ['abgesagt: Adventmarkt FF Finklham', 'Silvesterlauf ABGESAGT', 'Kinderturnen fällt aus',
    '*** ENTFÄLLT *** Lesung', 'Konzert - verschoben', 'Theaterabend findet nicht statt']) {
    assert.ok(isCancelledTitle(t), t);
  }
  for (const t of ['Zirkus Fällt aus dem Rahmen', 'Die Abgesagten – Theater', 'Adventmarkt', '']) {
    assert.ok(!isCancelledTitle(t), t);
  }
});

test('the unmarked title is recovered so the earlier row can be unpublished', () => {
  assert.equal(uncancelledTitle('abgesagt: Adventmarkt FF Finklham'), 'Adventmarkt FF Finklham');
  assert.equal(uncancelledTitle('Silvesterlauf ABGESAGT'), 'Silvesterlauf');
  assert.equal(uncancelledTitle('Adventmarkt'), null);
  assert.equal(uncancelledTitle('ABGESAGT'), null);
});

test('schema.org EventCancelled is flagged, not dropped', () => {
  assert.ok(isCancelledStatus('https://schema.org/EventCancelled'));
  assert.ok(!isCancelledStatus('https://schema.org/EventScheduled'));
  const html = `<script type="application/ld+json">${JSON.stringify([
    { '@type': 'Event', name: 'Laternenfest', startDate: '2026-11-20T17:00', eventStatus: 'https://schema.org/EventCancelled' },
    { '@type': 'Event', name: 'Adventsingen', startDate: '2026-11-21T17:00' },
  ])}</script>`;
  const events = parseJsonLdEvents(html, { town: 'Linz' });
  assert.equal(events.find((e) => e.title === 'Laternenfest')?.cancelled, true);
  assert.equal(events.find((e) => e.title === 'Adventsingen')?.cancelled, undefined);
});

test('address town comes from the postcode, country suffix ignored', () => {
  assert.equal(addressTown('Florianstraße 5, 5323 Ebenau'), 'Ebenau');
  assert.equal(addressTown('5090 Lofer'), 'Lofer');
  assert.equal(addressTown('Hauptplatz 1, A-4020 Linz, Österreich'), 'Linz');
  assert.equal(addressTown('Straße 12, D-83022 Rosenheim'), 'Rosenheim');
  assert.equal(addressTown('Hauptplatz 1'), null);
  assert.equal(addressTown('Am Bach 3, 4020'), null);
});

test('same town however it is spelled, different towns stay apart', () => {
  assert.ok(sameTown('Hennersdorf (Niederösterreich)', 'Hennersdorf'));
  assert.ok(sameTown('Sankt Georgen bei Salzburg', 'St. Georgen'));
  assert.ok(sameTown('Sankt Georgen bei Salzburg', 'St.Georgen b.Sbg.'));
  assert.ok(sameTown('Linz-Urfahr', 'Linz'));
  assert.ok(!sameTown('Steyr', 'Steyregg'));
  assert.ok(!sameTown('Bad Hall', 'Bad Ischl'));
  assert.ok(!sameTown('Untertauern', 'Obertauern'));
  assert.ok(!sameTown('Kematen an der Krems', 'Kirchdorf an der Krems'));
});

test('GEM2GO va_list rows: long-form date spans and the venue in the title cell', () => {
  const html = `<table class="vazusatzinfo_tabelle ris_table">
    <tr class="odd"><td class="td_va" data-label=""><span><span class="va_list_dayofweek" ><abbr title='Sonntag'>So</abbr>,</span>
      <span class="va_list_day" >15</span>. <span class="va_list_month" >November</span> <span class="va_list_year" >2026</span>
      <span class="va_list_time" >16:00 - 20:00 Uhr</span></span></td>
    <td class="td_va" data-label=""><span class="va_list_bez"><a href="/Martinsfest">Martinsfest - Laternenrundgang der Kinder</a></span><br />
      <span class="va_list_veranstaltungsort">Veranstaltungsort<br />Kultursaal</span></td>
    <td class="td_va" data-label=""><a href="/img"><img alt="Kinder" src="/x.jpg" class="va_list_foto" /></a></td></tr>
    <tr class="even"><td class="td_va" data-label="">ohne Datum</td><td class="td_va"><a href="/x">Kein Datum</a></td></tr>
  </table>`;
  const [ev, ...rest] = parseGem2goEvents(html, { url: 'https://www.alkoven.at/Veranstaltungen', town: 'Alkoven' });
  assert.equal(rest.length, 0, 'a row without a date is skipped');
  assert.equal(ev.title, 'Martinsfest - Laternenrundgang der Kinder');
  assert.equal(ev.date_start, '2026-11-15');
  assert.equal(ev.time_start, '16:00');
  assert.equal(ev.time_end, '20:00');
  assert.equal(ev.venue, 'Kultursaal');
  assert.equal(ev.source_url, 'https://www.alkoven.at/Martinsfest');
});
