import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKinderfreundeCard } from '../lib/kinderfreunde-events.js';

function cardAt(address) {
  return parseKinderfreundeCard(`
    <h4 class="card-title">Jugendtreff</h4>
    <a class="readmore" href="/veranstaltungen/jugendtreff"></a>
    <i class="fa-calendar-day"></i>22.10.2026<span></span>
    <i class="fa-map-marker-alt"></i>${address}<span></span>
  `, 'https://kinderfreunde.at/veranstaltungen');
}

test('Kinderfreunde keeps compound street names out of the town field', () => {
  for (const address of ['Gramartstraße 7', 'Dauphinestrasse 151', 'Edlingergasse 34', 'Hauptplatz 1']) {
    const event = cardAt(address);
    assert.equal(event.address, address);
    assert.equal(event.town, null);
    assert.equal(event.venue, null);
  }
});

test('Kinderfreunde still accepts a lone town or an explicit postcode and town', () => {
  assert.equal(cardAt('St. Florian am Inn').town, 'St. Florian am Inn');
  const event = cardAt('Zwergenhaus, Gramartstraße 7, 6020 Innsbruck');
  assert.equal(event.town, 'Innsbruck');
  assert.equal(event.address, 'Gramartstraße 7');
  assert.equal(event.venue, 'Zwergenhaus');
});
