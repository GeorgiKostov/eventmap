import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/partners/page.js', import.meta.url), 'utf8');
const showcase = readFileSync(new URL('../app/partners/partner-showcase.js', import.meta.url), 'utf8');
const map = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
const translations = readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');

test('partner sales material is a shareable HTML showcase, not a slide download', () => {
  assert.match(page, /dynamic = 'force-static'/);
  assert.match(page, /robots:\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/);
  assert.match(page, /'@type': 'Service'/);
  assert.match(showcase, /src="\/partners\/festival-map-showcase\.webp"/);
  assert.match(showcase, /src="\/partners\/festival-map-showcase-mobile\.webp"/);
  assert.match(showcase, /href="\/partners\/demo"/);
  assert.doesNotMatch(showcase, /<iframe/);
  assert.match(showcase, /partner_showcase_view/);
  assert.doesNotMatch(showcase, /\.pptx|powerpoint/i);
  assert.match(showcase, /<OkoloBrand \/>/);
  assert.doesNotMatch(showcase, /className=\{styles\.wordmark\}/);
});

test('map menu links organisers to the partner showcase', () => {
  assert.match(map, /className="menuitem"\s+href="\/partners"/);
  assert.match(map, /partner_showcase_open/);
  assert.doesNotMatch(map, /advertiseOpen|setAdvertiseOpen/);
});

test('partner showcase states the managed service and Okolo distribution offer', () => {
  assert.match(translations, /Okolo designs, builds and hosts a branded map experience/);
  assert.match(translations, /Approved events are also listed on Okolo’s main map/);
  assert.match(translations, /Optional paid highlighting adds visibility and is always labelled clearly as sponsored/);
  assert.match(translations, /You provide the programme\. We run the map\./);
  assert.match(translations, /First public partner pilot/);
  assert.match(translations, /permission is separate from delivery and is never assumed/);
  assert.doesNotMatch(translations, /optional custom pins/);
  assert.match(showcase, /partnerShowcaseMailBody/);
  assert.match(showcase, /partner_showcase_live_proof_open/);
});
