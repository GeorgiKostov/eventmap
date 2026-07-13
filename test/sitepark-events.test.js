import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSiteparkRssItems, siteparkIcalUrl } from '../lib/sitepark-events.js';

test('extracts only exact Sitepark RSS title/detail pairs', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[Kinderfest &amp; Musik]]></title>
    <link>https://www.stuttgart.de/veranstaltungskalender/veranstaltungen/kinderfest-123</link>
  </item><item><title>Broken</title></item></channel></rss>`;
  assert.deepEqual(parseSiteparkRssItems(xml), [{
    title: 'Kinderfest & Musik',
    detailUrl: 'https://www.stuttgart.de/veranstaltungskalender/veranstaltungen/kinderfest-123',
  }]);
});

test('builds the official per-event iCal URL without losing the detail path', () => {
  assert.equal(
    siteparkIcalUrl('https://www.stuttgart.de/veranstaltungskalender/veranstaltungen/kinderfest-123'),
    'https://www.stuttgart.de/veranstaltungskalender/veranstaltungen/kinderfest-123?sp%3Aout=iCal',
  );
});
