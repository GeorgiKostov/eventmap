import test from 'node:test';
import assert from 'node:assert/strict';
import { ennsDetailUrls, parseEnnsDetail, fetchEnnsEvents } from '../lib/enns-events.js';

const url = 'https://erlebe.enns.at/events/ennser-adventmarkt-2026/16437457';
const data = {
  type: 'EVENT', title: 'Ennser Adventmarkt - 2026', country: 'AT', city: 'Enns',
  addressLine: 'Schlossgasse 4', zipCode: '4470', categories: ['Kultur'],
  startDate: '2026-12-05T09:00:00Z', endDate: '2026-12-05T18:00:00Z',
  description: 'Source prose must not be copied.',
  openingHours: [{ openingHourDate: '2026-12-05', openingHourStart: '10:00', openingHourEnd: '19:00' }],
};
const html = (value) => `<script>window.dataFetchedByServer = {"singleViewPageData":${JSON.stringify(value)},"singleViewLunchData":undefined};</script>`;

test('Enns preserves explicit local occurrence instead of UTC time or a guessed season', () => {
  const [event] = parseEnnsDetail(html(data), url);
  assert.equal(event.date_start, '2026-12-05');
  assert.equal(event.time_start, '10:00');
  assert.equal(event.time_end, '19:00');
  assert.equal(event.date_end, null);
  assert.equal(event.source_url, url);
  assert.equal(event.description, null);
  assert.equal(event.address, 'Schlossgasse 4, 4470');
  assert.deepEqual(event.categories, ['market', 'culture']);
});

test('Enns never invents undated, closed or on-request occurrences', () => {
  assert.deepEqual(parseEnnsDetail(html({ ...data, openingHours: [{ saturday: true }] }), url), []);
  assert.deepEqual(parseEnnsDetail(html({ ...data, openingHours: [{ ...data.openingHours[0], closed: true }] }), url), []);
  const [event] = parseEnnsDetail(html({ ...data, openingHours: [{ openingHourDate: '2026-12-06' }] }), url);
  assert.equal(event.time_start, null);
  assert.equal(event.time_end, null);
});

test('Enns sitemap resolves only same-publisher detail links and fails honestly on empty extraction', async () => {
  const xml = `<urlset><loc>${url}</loc><loc>${url}</loc><loc>https://example.com/event/1</loc></urlset>`;
  assert.deepEqual(ennsDetailUrls(xml), [url]);
  const events = await fetchEnnsEvents(xml, { robotsFn: async () => true, fetchImpl: async () => ({ ok: true, text: async () => html(data) }) });
  assert.equal(events.length, 1);
  await assert.rejects(fetchEnnsEvents(xml, { robotsFn: async () => true, fetchImpl: async () => ({ ok: true, text: async () => '<html>Changed markup</html>' }) }), /no dated occurrences/);
});
