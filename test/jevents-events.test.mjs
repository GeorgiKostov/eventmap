import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jeventsMonthUrls, jeventsDetailUrls, parseJeventsDetail,
} from '../lib/jevents-events.js';

test('jeventsMonthUrls builds current + next N-1 months anchored on day 01, rolling over year boundaries', () => {
  assert.deepEqual(
    jeventsMonthUrls('https://example.bg/bg/component/jevents/', 3, '2026-07-16T10:00'),
    [
      'https://example.bg/bg/component/jevents/month.calendar/2026/07/01/-',
      'https://example.bg/bg/component/jevents/month.calendar/2026/08/01/-',
      'https://example.bg/bg/component/jevents/month.calendar/2026/09/01/-',
    ],
  );
  assert.deepEqual(
    jeventsMonthUrls('https://example.bg/bg/component/jevents', 2, '2026-12-01T00:00'),
    [
      'https://example.bg/bg/component/jevents/month.calendar/2026/12/01/-',
      'https://example.bg/bg/component/jevents/month.calendar/2027/01/01/-',
    ],
  );
});

test('jeventsDetailUrls collects unique, absolute icalrepeat.detail links from a month listing page', () => {
  const html = `
    <div id="jev_maincal" class="jev_listview">
      <div class="jev_list_row"><div class="jev_list_container">
        <h3 class="jev_list_title"><a href="/bg/component/jevents/icalrepeat.detail/2026/07/12/24821/-/festival?Itemid=330">Fest</a></h3>
      </div></div>
      <div class="jev_list_row"><div class="jev_list_container">
        <h3 class="jev_list_title"><a href="/bg/component/jevents/icalrepeat.detail/2026/07/15/24778/-/vacation">Vacation</a></h3>
      </div></div>
    </div>
    <div>duplicate widget link: <a href="/bg/component/jevents/icalrepeat.detail/2026/07/12/24821/-/festival?Itemid=330">Fest again</a></div>
  `;
  assert.deepEqual(
    jeventsDetailUrls(html, 'https://visitsofia.bg/bg/component/jevents/month.calendar/2026/07/01/-'),
    [
      'https://visitsofia.bg/bg/component/jevents/icalrepeat.detail/2026/07/12/24821/-/festival?Itemid=330',
      'https://visitsofia.bg/bg/component/jevents/icalrepeat.detail/2026/07/15/24778/-/vacation',
    ],
  );
});

// Fixture mirrors the live jevents "iconic" detail-view template observed on
// visitsofia.bg (2026-07-16): <h1> title, a `.jevents_text_container` prose
// block (never copied), and a `.infoinside` sidebar with infodate/infoplace/
// infolocation.
const DETAIL_WITH_VENUE = `
<html><body>
<div class="row"><h1>Софийски фестивал на изкуствата и музиката: Музикални пейзажи</h1></div>
<div class="jevents_text_container">Зала „България" — организаторски текст, не се копира.</div>
<div class="infoinside">
  <div><i class="fa fa-info"></i><p>Фестивали и чествания</p></div>
  <div class="infodate"><i class="fa fa-clock-o"></i><p>
      неделя 12 юли 2026                                        19:30                                    </p></div>
  <div class="infoplace"><i class="fa fa-university"></i><p>
      София                    </p></div>
  <div class="infolocation"><i class="fa fa-map-marker"></i><p>
      ул „Аксаков"  1                    </p></div>
</div>
</body></html>`;

const DETAIL_DATE_ONLY_NO_LOCATION = `
<html><body>
<div class="row"><h1>ВЕСЕЛА ВАКАНЦИЯ - безплатни летни занимания на открито за деца над 5 години</h1></div>
<div class="jevents_text_container">22 юни – 14 август, 11:00-13:00 часа. Never parsed for a time.</div>
<div class="infoinside">
  <div><i class="fa fa-info"></i><p>Фестивали и чествания</p></div>
  <div class="infodate"><i class="fa fa-clock-o"></i><p>
      сряда 15 юли 2026                                                                            </p></div>
</div>
</body></html>`;

const DETAIL_NO_DATE = `
<html><body>
<div class="row"><h1>Untitled placeholder without a structured date</h1></div>
<div class="infoinside"><div><i class="fa fa-info"></i><p>Изложби</p></div></div>
</body></html>`;

test('parseJeventsDetail extracts date+time+venue+address verbatim from the structured sidebar, never from prose', () => {
  const ev = parseJeventsDetail(DETAIL_WITH_VENUE, 'https://visitsofia.bg/bg/component/jevents/icalrepeat.detail/2026/07/12/24821/-/x');
  assert.equal(ev.title, 'Софийски фестивал на изкуствата и музиката: Музикални пейзажи');
  assert.equal(ev.date_start, '2026-07-12');
  assert.equal(ev.time_start, '19:30');
  assert.equal(ev.date_end, null);
  assert.equal(ev.time_end, null);
  assert.equal(ev.venue, 'София');
  assert.equal(ev.address, 'ул „Аксаков" 1'); // stripTags collapses whitespace runs
  assert.equal(ev.description, null); // never copy the jevents_text_container prose
  assert.equal(ev.source_url, 'https://visitsofia.bg/bg/component/jevents/icalrepeat.detail/2026/07/12/24821/-/x');
});

test('parseJeventsDetail: missing time/venue/address stay null — never fabricated', () => {
  const ev = parseJeventsDetail(DETAIL_DATE_ONLY_NO_LOCATION, 'https://visitsofia.bg/x');
  assert.equal(ev.date_start, '2026-07-15');
  assert.equal(ev.time_start, null); // the "11:00-13:00" only exists in unparsed prose
  assert.equal(ev.venue, null);
  assert.equal(ev.address, null);
  assert.deepEqual(ev.categories, ['family']); // title contains "деца"
});

test('parseJeventsDetail: no parseable infodate -> skipped entirely (returns null)', () => {
  assert.equal(parseJeventsDetail(DETAIL_NO_DATE, 'https://visitsofia.bg/x'), null);
});

test('parseJeventsDetail: no <h1> title -> skipped entirely (returns null)', () => {
  assert.equal(parseJeventsDetail('<html><body>no title here</body></html>', 'https://visitsofia.bg/x'), null);
});
