import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/partners/page.js', import.meta.url), 'utf8');
const showcase = readFileSync(new URL('../app/partners/partner-showcase.js', import.meta.url), 'utf8');

test('partner sales material is a shareable HTML showcase, not a slide download', () => {
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.match(showcase, /src="\/partners\/festival-map-showcase\.webp"/);
  assert.match(showcase, /src="\/partners\/festival-map-showcase-mobile\.webp"/);
  assert.match(showcase, /href="\/partners\/demo"/);
  assert.doesNotMatch(showcase, /<iframe/);
  assert.match(showcase, /partner_showcase_view/);
  assert.doesNotMatch(showcase, /\.pptx|powerpoint/i);
});
