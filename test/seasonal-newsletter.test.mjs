import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNewsletter } from '../lib/digest.js';
import { newsletterSeason } from '../lib/seasonal-newsletter.js';

function issue(from, to, events, lang = 'en') {
  return {
    channel: { slug: 'linz', label: 'Linz', handle: 'okolo.linz', lat: 48.3, lng: 14.28, lang },
    window: { from, to, friday: from, sunday: to },
    label: `${from} – ${to}`, subject: 'Your weekend', intro: 'Our local picks.',
    items: events.map((event, i) => ({
      id: String(i + 1), title: 'Local concert', startsAt: `${from}T16:00`,
      when: 'Published time', venue: 'Published venue', badges: [], cat: 'culture',
      teaser: 'Original short description.', url: `https://okolo.events/event/${i + 1}`,
      ...event,
    })),
  };
}
const render = (digest) => renderNewsletter(digest, { unsubscribeUrl: 'https://okolo.events/unsubscribe/example' });

test('ordinary picks and old snapshots retain a neutral newsletter even during a holiday', () => {
  for (const events of [[], [{}], [{ title: 'Christmas market', startsAt: null }]]) {
    const digest = issue('2026-12-18', '2026-12-20', events);
    assert.equal(newsletterSeason(digest), null);
    const { html, text } = render(digest);
    assert.doesNotMatch(html, /Among this weekend/);
    assert.doesNotMatch(text, /Among this weekend/);
  }
});

test('selected Halloween picks create the same readable seasonal heading in HTML and text', () => {
  const digest = issue('2026-10-30', '2026-11-01', [{ title: 'Halloween at the museum', highlight: 'gold' }]);
  const { html, text } = render(digest);
  assert.equal(newsletterSeason(digest).theme, 'halloween');
  assert.match(html, /🎃/);
  assert.match(html, /Among this weekend’s picks/);
  assert.match(text, /Among this weekend’s picks: Halloween/);
  assert.match(html, /Sponsored/);
  assert.match(html, /Published time/);
  assert.match(html, /Published venue/);
  assert.match(html, /https:\/\/okolo.events\/event\/1\?utm_source=okolo/);
  assert.doesNotMatch(html, /<img|<svg|<script|url\(/i);
});

test('issue dates control archival styling; stale or out-of-week picks cannot decorate a spring issue', () => {
  const christmas = { title: 'Weihnachtsmarkt', startsAt: '2026-12-19T10:00' };
  assert.equal(newsletterSeason(issue('2026-12-18', '2026-12-20', [christmas])).theme, 'christmas_market');
  assert.equal(newsletterSeason(issue('2027-03-26', '2027-03-28', [christmas])), null);
  assert.equal(newsletterSeason(issue('2027-03-26', '2027-03-28', [
    { ...christmas, endsAt: '2027-04-01T18:00' },
  ])), null);
  assert.equal(newsletterSeason(issue('2026-10-23', '2026-10-25', [
    { title: 'Halloween', startsAt: '2026-10-31T16:00' },
  ])), null);
});

test('cross-month weekend can use an active selected event; expired Halloween does not linger', () => {
  assert.equal(newsletterSeason(issue('2026-10-30', '2026-11-01', [
    { title: 'Halloween', startsAt: '2026-11-01T14:00' },
  ])).theme, 'halloween');
  assert.equal(newsletterSeason(issue('2026-11-06', '2026-11-08', [
    { title: 'Halloween', startsAt: '2026-11-07T14:00' },
  ])), null);
});

test('the leading actual theme wins ties, and the most represented theme wins otherwise', () => {
  const events = [
    { title: 'Adventkonzert' }, { title: 'Weihnachtsmarkt' },
  ];
  assert.equal(newsletterSeason(issue('2026-12-18', '2026-12-20', events)).theme, 'christmas');
  events.push({ title: 'Christkindlmarkt' });
  assert.equal(newsletterSeason(issue('2026-12-18', '2026-12-20', events)).theme, 'christmas_market');
});

test('spring occasions use the common calendar and localized labels without modifying facts', () => {
  for (const [from, to, title, theme] of [
    ['2027-02-12', '2027-02-14', 'Valentinstag Konzert', 'valentine'],
    ['2027-02-05', '2027-02-07', 'Faschingsumzug', 'fasching'],
    ['2027-03-26', '2027-03-28', 'Ostermarkt', 'easter'],
  ]) {
    for (const lang of ['en', 'de', 'bg']) {
      const digest = issue(from, to, [{ title }], lang);
      const before = JSON.stringify(digest);
      assert.equal(newsletterSeason(digest).theme, theme);
      const { html, text } = render(digest);
      assert.ok(html.includes(newsletterSeason(digest).label));
      assert.ok(text.includes(newsletterSeason(digest).label));
      assert.equal(JSON.stringify(digest), before);
    }
  }
});

test('seasonal visuals never interpolate unescaped event prose or add claims', () => {
  const title = 'Halloween <script>alert(1)</script> & friends';
  const digest = issue('2026-10-30', '2026-11-01', [{ title, teaser: '<b>Original</b>', venue: '<iframe>' }]);
  const { html, text } = render(digest);
  assert.match(html, /Halloween &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; friends/);
  assert.doesNotMatch(html, /<script|<iframe|<b>Original/);
  assert.ok(text.includes(title));
  assert.equal(digest.items.length, 1);
});
