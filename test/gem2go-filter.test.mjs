import test from 'node:test';
import assert from 'node:assert/strict';
import { gem2goFilterForm, walkGem2goFilter, addDays } from '../lib/gem2go-filter.js';

const page = (state, days) => `
<form method="post" action="/system/web/veranstaltung.aspx?menuonr=1&amp;sprache=1" id="aspnetForm">
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="${state}">
<input id="fromDate-9" name="fromDate-9" type="date" value="2026-11-12">
${days.map((d) => `<li data-day="${d}">x</li>`).join('')}
</form>`;
const parse = (html) => [...html.matchAll(/data-day="([^"]+)"/g)].map(([, d]) => ({ title: `E ${d}`, starts_at: `${d}T10:00` }));

test('gem2goFilterForm reads action, date field and hidden state', () => {
  const f = gem2goFilterForm(page('abc', []), 'https://www.steyr.at/veranstaltungen');
  assert.equal(f.url, 'https://www.steyr.at/system/web/veranstaltung.aspx?menuonr=1&sprache=1');
  assert.equal(f.dateField, 'fromDate-9');
  assert.deepEqual(f.hidden, { __VIEWSTATE: 'abc' });
  assert.equal(gem2goFilterForm('<div>no form</div>', 'https://x.at/'), null);
});

test('walkGem2goFilter posts moving fromDate, dedupes and stops at the horizon', async () => {
  const posted = [];
  const fetchPage = async (_url, body) => {
    const from = body.get('fromDate-9');
    posted.push({ from, state: body.get('__VIEWSTATE') });
    return page(`s${posted.length}`, [from, addDays(from, 3)]);
  };
  const first = page('s0', ['2026-11-12']);
  const events = await walkGem2goFilter(first, {
    pageUrl: 'https://www.steyr.at/veranstaltungen', today: '2026-11-12', fetchPage, parse, events: parse(first),
  });
  assert.equal(posted[0].from, '2026-11-12');
  assert.equal(posted[0].state, 's0');
  assert.equal(posted[1].state, 's1'); // viewstate refreshed from each response
  assert.equal(posted[1].from, '2026-11-15');
  const days = events.map((e) => e.starts_at.slice(0, 10));
  assert.equal(new Set(days).size, days.length);
  assert.ok(days.at(-1) <= addDays('2026-11-12', 63));
});

test('walkGem2goFilter steps a day when a round adds nothing', async () => {
  const posted = [];
  const fetchPage = async (_url, body) => { posted.push(body.get('fromDate-9')); return page('s', ['2026-11-12']); };
  await walkGem2goFilter(page('s', ['2026-11-12']), {
    pageUrl: 'https://x.at/', today: '2026-11-12', fetchPage, parse, events: parse(page('s', ['2026-11-12'])),
  });
  assert.deepEqual(posted.slice(0, 3), ['2026-11-12', '2026-11-13', '2026-11-14']);
});

test('walkGem2goFilter stops as soon as a page is empty', async () => {
  let calls = 0;
  const fetchPage = async () => { calls++; return page('s', []); };
  await walkGem2goFilter(page('s', ['2026-11-12']), {
    pageUrl: 'https://x.at/', today: '2026-11-12', fetchPage, parse, events: [],
  });
  assert.equal(calls, 1);
});
