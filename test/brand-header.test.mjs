import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('one shared tokenized lockup owns the pin, lowercase title, suffix and qualifier', () => {
  const brand = read('app/okolo-brand.js');
  const css = read('app/globals.css');

  assert.match(brand, /className="okolo-brand-mark"/);
  assert.match(brand, /<span className="okolo-brand-name">okolo/);
  assert.match(brand, /channelHandle/);
  assert.match(brand, /okolo-brand-qualifier/);
  assert.match(css, /\.okolo-brand-mark[\s\S]*var\(--accent\)[\s\S]*var\(--panel\)[\s\S]*var\(--shadow-sm\)/);
  assert.match(css, /\.okolo-brand-name[\s\S]*var\(--font-display\)/);
});

test('map and partner-map families keep the shared brand persistent on desktop and mobile', () => {
  const home = read('app/page.js');
  const preview = read('app/aecfestival/page.js');
  const demo = read('app/partners/demo/partner-demo.js');

  assert.match(home, /import OkoloBrand from '\.\/okolo-brand\.js'/);
  assert.equal((home.match(/<OkoloBrand channelHandle=\{weekendChannel\?\.handle\}/g) || []).length, 2);
  assert.ok(home.indexOf('<OkoloBrand channelHandle={weekendChannel?.handle}') < home.indexOf('{selected && isDesktop ?'));
  assert.match(preview, /return <Home partnerSlug="aecfestival" \/>/);
  assert.equal((demo.match(/<OkoloBrand qualifier=\{t\.partnerDemoNotice\} \/>/g) || []).length, 2);
  assert.match(demo, /className=\{styles\.mobileBrandTop\}[\s\S]*?<OkoloBrand qualifier=\{t\.partnerDemoNotice\}/);
});

test('discovery, event, weekend, legal and admin families all reuse the shared lockup', () => {
  const expectations = new Map([
    ['app/events/page.js', /<OkoloBrand \/>/],
    ['app/events/seo-page.js', /<OkoloBrand channelHandle=\{channel\?\.handle\} \/>/],
    ['app/events/methodology/page.js', /<OkoloBrand \/>/],
    ['app/event/[id]/page.js', /<OkoloBrand href=\{null\} channelHandle=\{channel\?\.handle\} \/>/],
    ['app/weekend/[city]/page.js', /<OkoloBrand channelHandle=\{channel\.handle\} \/>/],
    ['app/weekend/[city]/[weekend]/page.js', /<OkoloBrand channelHandle=\{channel\.handle\} \/>/],
    ['app/impressum/page.js', /<OkoloBrand \/>/],
    ['app/datenschutz/page.js', /<OkoloBrand \/>/],
    ['lib/admin-ui.js', /<OkoloBrand qualifier="admin"/],
  ]);

  for (const [path, pattern] of expectations) {
    assert.match(read(path), pattern, `${path} must render the shared Okolo brand`);
  }
});

test('event detail preserves return and tracked discovery wrappers around the shared lockup', () => {
  const eventPage = read('app/event/[id]/page.js');

  assert.match(eventPage, /\{discoveryReturn \? \(\s*<Link\s+href=\{discoveryReturn\}[\s\S]*?<OkoloBrand href=\{null\}/);
  assert.match(eventPage, /<MapDiscoveryLink[\s\S]*?placement="header"[\s\S]*?<OkoloBrand href=\{null\}/);
  assert.equal((eventPage.match(/\{headerLabel\}/g) || []).length >= 3, true);
});
