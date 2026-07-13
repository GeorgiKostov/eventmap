import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSindelfingenEvents, sindelfingenPageCount } from '../lib/sindelfingen-events.js';

test('parses official Sindelfingen list facts and exact link', () => {
  const html = `<div class="hw_fe__record hwveranstaltung__record"><h3 class="hw_record__title"><span>Kinder &amp; Sport</span></h3>
    <span class="hw_tag hw_record__categories--19">Kinder &amp; Familie</span>
    <div class="hw_record__value hw_record__date"><span class="hw_record__value__text">22.06.2026 bis 17.07.2026</span></div>
    <div class="hw_record__value hw_record__time"><span class="hw_record__value__text">11:00 Uhr bis 13:30 Uhr</span></div>
    <div class="hw_record__value hw_record__simpleLocation"><span class="hw_record__value__text">Floschenstadion</span></div>
    <a class="hw_button hw_record__more__show" href="/kultur-freizeit/veranstaltungen/veranstaltungskalender/1259/foo">Mehr</a></div><nav></nav>`;
  const [event] = parseSindelfingenEvents(html);
  assert.equal(event.title, 'Kinder & Sport');
  assert.equal(event.date_start, '2026-06-22');
  assert.equal(event.date_end, '2026-07-17');
  assert.equal(event.time_start, '11:00');
  assert.equal(event.time_end, '13:30');
  assert.equal(event.venue, 'Floschenstadion');
  assert.deepEqual(event.categories, ['family']);
  assert.equal(event.description_short, null);
  assert.equal(event.source_url, 'https://www.sindelfingen.de/kultur-freizeit/veranstaltungen/veranstaltungskalender/1259/foo');
});

test('finds the last Sindelfingen result page', () => {
  assert.equal(sindelfingenPageCount('<a href="/veranstaltungskalender/seite-23/suche-none">Letzte</a>'), 23);
});
