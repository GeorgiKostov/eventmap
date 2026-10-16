import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLinztermineDetail, linztermineOccurrenceHtml } from '../lib/linztermine-events.js';

test('Linztermine uses each visible occurrence, never the multi-year JSON-LD span', () => {
  const html = `<h1>Weihnachtsmarkt im Linzer Volksgarten</h1>
    <script type="application/ld+json">{"@type":"Event","startDate":"2022-11-19T10:00+01:00","endDate":"2026-12-24T16:00+01:00","location":{"name":"Volksgarten","address":{"streetAddress":"__"}}}</script>
    <a href="/suche?free=true">Gratis</a><a href="/suche?children=true">Für Kinder</a>
    <section><div id="event-dates-list"><li class="list-group-item"><span><strong>Datum:</strong></span>Sa., 21.11.2026 <span><strong>Uhrzeit:</strong></span>10:00 bis 21:00 Uhr</li>
    <li class="list-group-item"><span><strong>Datum:</strong></span>Do., 24.12.2026 <span><strong>Uhrzeit:</strong></span>10:00 bis 16:00 Uhr</li></div></section>`;
  const events = parseLinztermineDetail(html, 'https://www.linztermine.at/event/702661');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => [e.date_start, e.time_start, e.time_end]), [['2026-11-21', '10:00', '21:00'], ['2026-12-24', '10:00', '16:00']]);
  assert.equal(events[0].address, null);
  assert.equal(events[0].description, null);
  assert.deepEqual(events[0].categories, ['market', 'family']);
  assert.equal(events[0].is_free, true);
});

test('Linztermine never falls back to the misleading structured date range', () => {
  assert.deepEqual(parseLinztermineDetail('<h1>Adventmarkt</h1><script type="application/ld+json">{"@type":"Event","startDate":"2022-11-19","endDate":"2026-12-24"}</script>', 'https://www.linztermine.at/event/1'), []);
});

test('single-date header is usable and related free events do not label a paid event free', () => {
  const events = parseLinztermineDetail('<h1>Umgekehrter Weihnachtsmarkt</h1><p><span><strong>Datum:</strong></span>12.12.2026 / 10:00 bis 17:00 Uhr</p><section id="more"><a href="/suche?free=true">Another event</a></section>', 'https://www.linztermine.at/event/717506');
  assert.equal(events.length, 1);
  assert.equal(events[0].date_start, '2026-12-12');
  assert.equal(events[0].time_end, '17:00');
  assert.equal(events[0].is_free, null);
});

test('date pagination submits the visible control and rejects a stalled result', async () => {
  const row = '<li class="list-group-item">date</li>';
  const form = `<form id="dates" action="/event/702661;jsessionid=example">${row}<a id="dates:more">Mehr Termine anzeigen</a><input name="jakarta.faces.ViewState" value="state" /></form>`;
  const html = `<section id="event-dates-list">${form}</section>`;
  const fetchImpl = async (_url, options) => {
    assert.equal(options.body.get('dates:more'), 'dates:more');
    assert.equal(options.body.get('jakarta.faces.ViewState'), 'state');
    return { ok: true, text: async () => `<update id="dates"><![CDATA[<form id="dates" action="/event/702661">${row}${row}</form>]]></update>` };
  };
  assert.equal((await linztermineOccurrenceHtml(html, 'https://www.linztermine.at/event/702661', fetchImpl, async () => true)).match(/list-group-item/g).length, 2);
  await assert.rejects(linztermineOccurrenceHtml(html, 'https://www.linztermine.at/event/702661', async () => ({ ok: true, text: async () => `<update id="dates"><![CDATA[${form}]]></update>` }), async () => true), /no progress/);
});
