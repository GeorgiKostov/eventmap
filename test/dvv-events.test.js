import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDvvEvents } from '../lib/dvv-events.js';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss><channel><generator>dvv-Zusatzmodule - 10.14.6</generator>
<item>
  <title><![CDATA[13.07.2026-16.07.2026  Das Spielmobil kommt]]></title>
  <link>https://www.esslingen.de/event/123</link>
  <description><![CDATA[
    <div class="zmItem vevent"><h3 class="summary">
      <span class="dtstart" title="2026-07-13">Montag</span> -
      <span class="dtend" title="2026-07-16">Donnerstag</span> |
      <span class="uhr">16:30 bis 20 Uhr</span> Das Spielmobil kommt
    </h3><div class="vCard">
      <div class="organization">Neckaruferpark</div>
      <div class="street-address">Maille 1</div>
      <span class="postal-code">73728</span> <span class="locality">Esslingen am Neckar</span>
    </div></div>
  ]]></description>
</item></channel></rss>`;

test('parses DVV hCalendar facts with exact linkback and no copied description', () => {
  const events = parseDvvEvents(FEED, { town: 'Esslingen am Neckar' });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    title: 'Das Spielmobil kommt',
    date_start: '2026-07-13', time_start: '16:30',
    date_end: '2026-07-16', time_end: '20:00',
    venue: 'Neckaruferpark',
    address: 'Maille 1, 73728 Esslingen am Neckar',
    town: 'Esslingen am Neckar', categories: ['family'], is_free: null,
    age_min: null, age_max: null, indoor: null, description: null,
    source_url: 'https://www.esslingen.de/event/123',
  });
});

test('does not treat an arbitrary RSS feed as DVV event data', () => {
  assert.deepEqual(parseDvvEvents('<rss><channel><item><title>News</title></item></channel></rss>', { town: 'Stuttgart' }), []);
});

test('parses DVV German word-form minutes without inventing a 30:00 time', () => {
  const feed = FEED.replace('16:30 bis 20 Uhr', '9 Uhr 30 bis 11 Uhr 30');
  const [event] = parseDvvEvents(feed, { town: 'Esslingen am Neckar' });
  assert.equal(event.time_start, '09:30');
  assert.equal(event.time_end, '11:30');
});
