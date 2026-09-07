import test from 'node:test';
import assert from 'node:assert/strict';

// Run against a built local server with OKOLO_TEST_ORIGIN=http://localhost:3312.
const origin = process.env.OKOLO_TEST_ORIGIN;
const options = { skip: !origin };

for (const city of ['graz', 'innsbruck', 'stuttgart']) {
  test(`${city} weekend entry redirects to an issue or serves a noindex fallback`, options, async () => {
    const response = await fetch(`${origin}/weekend/${city}`, { redirect: 'manual' });
    if (response.status === 307) {
      assert.match(response.headers.get('location'), new RegExp(`^/weekend/${city}/\\d{4}-\\d{2}-\\d{2}$`));
      return;
    }
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<meta name="robots" content="noindex, follow"/);
    assert.match(html, /<h1[^>]*>/);
  });
}

test('generated sitemap omits stable weekend entries and retains dated issues and city discovery', options, async () => {
  const response = await fetch(`${origin}/sitemap.xml`);
  assert.equal(response.status, 200);
  const xml = await response.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  assert.ok(paths.length > 0);
  assert.equal(paths.some((path) => /^\/weekend\/[^/]+\/?$/.test(path)), false);
  assert.ok(paths.some((path) => /^\/weekend\/[^/]+\/\d{4}-\d{2}-\d{2}$/.test(path)));
  assert.ok(paths.includes('/events/linz'));
});
