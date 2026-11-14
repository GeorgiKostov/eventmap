import test from 'node:test';
import assert from 'node:assert/strict';
import { gem2goFilterForm, hasGem2goFilterForm, walkGem2goFilter, addDays } from '../lib/gem2go-filter.js';

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

// --- Variant B: text input "Datum ab" named by a numeric control id, dd.mm.yyyy ---
const pageB = (state, days) => `
<form method="post" action="/system/web/veranstaltung.aspx?menuonr=1&amp;sprache=1" id="aspnetForm">
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="${state}" />
<div class="filterVonDatum"><p>
  <label for="6869">Datum ab</label><input type="text" id="6869" name="6869" title="Datum ab" value="14.11.2026" /></p></div>
<div class="filterSubmitButton"><input class="button" type="submit" id="6873" name="btn_submit" value="Suchen" /></div>
<input type="hidden" id="6856" name="6856" value="True" />
<div class="va_list"></div>
${days.map((d) => `<li data-day="${d}">x</li>`).join('')}
</form>`;

test('gem2goFilterForm finds the "Datum ab" text input by label and reports dd.mm.yyyy', () => {
  const f = gem2goFilterForm(pageB('abc', []), 'https://www.peuerbach.at/Veranstaltungen');
  assert.equal(f.url, 'https://www.peuerbach.at/system/web/veranstaltung.aspx?menuonr=1&sprache=1');
  assert.equal(f.dateField, '6869');
  assert.equal(f.dateFormat, 'dmy');
  assert.deepEqual(f.hidden, { __VIEWSTATE: 'abc', 6856: 'True' });
  assert.equal(gem2goFilterForm(page('abc', []), 'https://x.at/').dateFormat, 'iso');
});

test('gem2goFilterForm finds the date field by title when there is no label', () => {
  const html = pageB('s', []).replace('<label for="6869">Datum ab</label>', '');
  assert.equal(gem2goFilterForm(html, 'https://x.at/').dateField, '6869');
});

test('hasGem2goFilterForm: both variants yes, plain pages and unrelated date inputs no', () => {
  assert.equal(hasGem2goFilterForm(page('s', [])), true);
  assert.equal(hasGem2goFilterForm(pageB('s', [])), true);
  assert.equal(hasGem2goFilterForm('<div>no form</div>'), false);
  const other = pageB('s', []).replace(/Datum ab/g, 'Geburtstag');
  assert.equal(hasGem2goFilterForm(other), false);
  // a "Datum ab" input outside the aspnetForm shell is not walkable
  assert.equal(hasGem2goFilterForm(pageB('s', []).replace('id="aspnetForm"', 'id="other"')), false);
});

test('walkGem2goFilter posts dd.mm.yyyy for the text variant and accepts date_start events', async () => {
  const posted = [];
  const parseB = (html) => [...html.matchAll(/data-day="([^"]+)"/g)].map(([, d]) => ({ title: `E ${d}`, date_start: d, time_start: null }));
  const fetchPage = async (_url, body) => {
    posted.push({ from: body.get('6869'), state: body.get('__VIEWSTATE'), layout: body.get('6856'), submit: body.get('btn_submit') });
    const iso = posted.length === 1 ? '2026-11-20' : '2026-11-27';
    return pageB(`s${posted.length}`, [iso]);
  };
  const first = pageB('s0', ['2026-11-14']);
  const events = await walkGem2goFilter(first, {
    pageUrl: 'https://x.at/Veranstaltungen', today: '2026-11-14', fetchPage, parse: parseB, events: parseB(first),
  });
  // cursor starts at the last page-1 day (date_start is read, not only starts_at)
  assert.equal(posted[0].from, '14.11.2026');
  assert.equal(posted[0].state, 's0');
  assert.equal(posted[0].layout, 'True');
  assert.equal(posted[0].submit, null); // no submit-button field needed
  assert.equal(posted[1].from, '20.11.2026');
  assert.equal(posted[1].state, 's1');
  assert.deepEqual(events.slice(0, 3).map((e) => e.date_start), ['2026-11-14', '2026-11-20', '2026-11-27']);
});

test('walkGem2goFilter keeps same-title events on different days (date_start shape)', async () => {
  const parseB = (html) => [...html.matchAll(/data-day="([^"]+)"/g)].map(([, d]) => ({ title: 'Theater', date_start: d, time_start: '19:00' }));
  let n = 0;
  const fetchPage = async () => (n++ ? null : pageB('s1', ['2026-11-15', '2026-11-16']));
  const first = pageB('s0', ['2026-11-14']);
  const events = await walkGem2goFilter(first, {
    pageUrl: 'https://x.at/', today: '2026-11-14', fetchPage, parse: parseB, events: parseB(first),
  });
  assert.deepEqual(events.map((e) => e.date_start), ['2026-11-14', '2026-11-15', '2026-11-16']);
});

// --- Variant C: <input type="date" class="vonDatum" title="Von"> on veranstaltung_liste pages ---
test('gem2goFilterForm handles the vonDatum date input (ISO) with ASP.NET control names', () => {
  const html = `<form method="post" action="/system/web/veranstaltung.aspx?menuonr=2&amp;sprache=1" id="aspnetForm">
<input type="hidden" name="__VIEWSTATE" value="v" />
<label title="Von" class="text shorttext vonDatum" for="c5">Von</label>
<input name="ctl00$list$ctl05" type="date" id="c5" maxlength="10" title="Von" class="text shorttext vonDatum" />
<input name="ctl00$list$ctl12" type="date" id="c12" title="bis" class="text shorttext bisDatum" /></form>`;
  const f = gem2goFilterForm(html, 'https://www.kirchham.at/Freizeit/Veranstaltungen');
  assert.equal(f.dateField, 'ctl00$list$ctl05');
  assert.equal(f.dateFormat, 'iso');
  assert.equal(hasGem2goFilterForm(html), true);
});
