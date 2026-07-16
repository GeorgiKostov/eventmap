// Highlight rendering in the newsletter — pure render, no network, no DB.
// Run: node --test test/digest-highlight.test.mjs
//
// These pin the ONE rule that matters legally (docs/decisions/2026-07-12-paid-
// placement-compliance.md, ECG §6 / MedienG §26): a gold pick is styled and
// labelled TOGETHER, or not at all. Colour alone is never disclosure, so a
// refactor that keeps the ring but drops the „Anzeige" tag is a compliance
// failure that no build or type check would catch — hence a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNewsletter } from '../lib/digest.js';

const GOLD = '#E8A800';
const EDITORIAL = '#C93A5B';

function digest(items, lang = 'de') {
  return {
    channel: { slug: 'linz', label: 'Linz', handle: 'okolo.linz', lat: 48.3, lng: 14.28, lang, country: 'AT' },
    window: { from: '2026-07-17', to: '2026-07-19', friday: '2026-07-17', sunday: '2026-07-19' },
    label: '17.–19. Juli',
    subject: 'S',
    intro: 'I',
    items: items.map((it, i) => ({
      id: String(i + 1), title: `Event ${i + 1}`, when: 'Fr 17.7.', venue: 'V', town: 'Linz',
      badges: [], cat: 'family', teaser: 'T', url: `https://okolo.events/event/${i + 1}`, ...it,
    })),
  };
}
const render = (items, lang) => renderNewsletter(digest(items, lang), { unsubscribeUrl: 'https://u', mapUrl: 'https://m' }).html;

test('gold pick: ring AND label render together', () => {
  const html = render([{ highlight: 'gold' }]);
  assert.ok(html.includes(`border:2px solid ${GOLD}`), 'gold ring missing');
  assert.ok(html.includes('Anzeige'), 'Anzeige label missing');
});

test('editorial pick: rings, but is NEVER labelled (our showcase is not an ad)', () => {
  const html = render([{ highlight: 'editorial' }]);
  assert.ok(html.includes(`border:2px solid ${EDITORIAL}`), 'editorial ring missing');
  assert.ok(!html.includes('Anzeige'), 'editorial must not carry an ad label');
});

test('no highlight: neither ring nor label (the ordinary case)', () => {
  const html = render([{}]);
  assert.ok(!html.includes(`border:2px solid ${GOLD}`));
  assert.ok(!html.includes(`border:2px solid ${EDITORIAL}`));
  assert.ok(!html.includes('Anzeige'));
});

// A snapshot frozen before `highlight` existed simply has no such field. It must
// degrade to "ordinary pick" — never to a styled-but-unlabelled one.
test('frozen pre-highlight snapshot (field absent) renders as an ordinary pick', () => {
  const html = render([{ highlight: undefined }]);
  assert.ok(!html.includes('Anzeige'));
  assert.ok(!html.includes(`border:2px solid ${GOLD}`));
});

test('an unknown/garbage tier is treated as not-highlighted, not as gold', () => {
  const html = render([{ highlight: 'platinum' }]);
  assert.ok(!html.includes('Anzeige'));
  assert.ok(!html.includes(`border:2px solid ${GOLD}`));
});

test('the ad label is localized and matches i18n adTag on every channel language', () => {
  assert.ok(render([{ highlight: 'gold' }], 'de').includes('Anzeige'));
  assert.ok(render([{ highlight: 'gold' }], 'en').includes('Sponsored'));
  assert.ok(render([{ highlight: 'gold' }], 'bg').includes('Реклама'));
});

test('exactly one label per gold pick — a mixed digest labels only the gold one', () => {
  const html = render([{ highlight: 'gold' }, { highlight: 'editorial' }, {}]);
  assert.equal((html.match(/Anzeige/g) || []).length, 1);
  assert.ok(html.includes(`border:2px solid ${EDITORIAL}`), 'editorial still rings');
});

// The category rule is the LEFT edge and the highlight ring is the other three:
// `border-left` is declared after `border`, so both survive. If that order ever
// flips, the category colour silently disappears from every highlighted card.
test('a highlighted card keeps its category rule on the left edge', () => {
  const html = render([{ highlight: 'gold', cat: 'family' }]);
  const card = html.slice(html.indexOf('border:2px solid'));
  assert.ok(/border:2px solid #E8A800;border-left:5px solid #/.test(card), 'category rule lost under the ring');
});
