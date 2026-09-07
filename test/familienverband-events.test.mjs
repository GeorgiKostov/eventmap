import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFamilienverbandEvents, fetchFamilienverbandEvents, FAMILIENVERBAND_SOURCE_URL } from '../lib/familienverband-events.js';

function card({ id = 1, start = '2026-11-7T14:00+2:00', end = '2026-11-7T16:30+2:00', address = 'Markus-Sittikus-Straße 20, 6845 Hohenems', status = 'EventScheduled' } = {}) {
  return `<div id="event_${id}_0" class="eventon_list_event"><div class="evo_event_schema">
  <a itemprop='url' href='https://familie.or.at/Veranstaltungen/blaster-${id}/'></a>
  <meta itemprop='startDate' content="${start}"/><meta itemprop='endDate' content="${end}"/>
  <meta itemprop='eventStatus' content="https://schema.org/${status}"/></div>
  <span class='evoet_title evcal_event_title' itemprop='name'>Blasterspaß für Kinder</span>
  <span class='event_location_attrs' data-location_address="${address}" data-location_name="Blaster Arena"></span>
  </div>`;
}

test('preserves published Vienna winter wall time and actual venue, without copying text', () => {
  const [event] = parseFamilienverbandEvents(card());
  assert.equal(event.date_start, '2026-11-07');
  assert.equal(event.time_start, '14:00');
  assert.equal(event.time_end, '16:30');
  assert.equal(event.town, 'Hohenems');
  assert.equal(event.venue, 'Blaster Arena');
  assert.equal(event.description, null);
  assert.equal(event.age_min, null);
  assert.ok(event.categories.includes('family'));
});

test('rejects German venues, missing venues, envelopes, invalid dates and cancelled events', () => {
  const html = card() + card() + card({ id: 2, address: 'Mywiler 161 B 88145 Opfenbach' })
    + card({ id: 3, address: '' }) + card({ id: 4, end: '2026-11-14T16:30+2:00' })
    + card({ id: 5, start: '2026-2-30T14:00+2:00' }) + card({ id: 6, status: 'EventCancelled' });
  assert.equal(parseFamilienverbandEvents(html).length, 1);
});

test('retains separate same-day occurrences instead of collapsing their shared detail URL', () => {
  const events = parseFamilienverbandEvents(card() + card({ start: '2026-11-7T16:30+2:00', end: '2026-11-7T19:00+2:00' }));
  assert.equal(events.length, 2);
});

test('recovers empty archive from same-site listing and linked featured detail, checks robots', async () => {
  const requested = [];
  const shellHtml = `<a href="https://familie.or.at/Veranstaltungen/lecture/">Details</a><a href="https://foreign.example/Veranstaltungen/x/">Other</a><link href="https://familie.or.at/Veranstaltungen/feed/">`;
  const events = await fetchFamilienverbandEvents(undefined, {
    shellHtml,
    robotsFn: async (url) => { assert.ok(url.startsWith('https://familie.or.at/')); return true; },
    fetchImpl: async (url) => { requested.push(url); return { ok: true, text: async () => card() }; },
  });
  assert.equal(events.length, 1);
  assert.deepEqual(requested, ['https://familie.or.at/', 'https://familie.or.at/vater-sein/', 'https://familie.or.at/Veranstaltungen/lecture/']);
  assert.deepEqual(await fetchFamilienverbandEvents(undefined, { robotsFn: async () => false }), []);
  await assert.rejects(fetchFamilienverbandEvents({ url: FAMILIENVERBAND_SOURCE_URL }, {
    robotsFn: async () => true, fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /503/);
  await assert.rejects(fetchFamilienverbandEvents(undefined, {
    shellHtml: '', robotsFn: async () => true, fetchImpl: async () => ({ ok: true, text: async () => '' }),
  }), /no dated Austrian venue events/);
});
