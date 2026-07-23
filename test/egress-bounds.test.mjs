import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('request-time event surfaces never call the maintenance full-catalog helper', () => {
  const requestPaths = [
    'app/api/events/route.js',
    'app/api/scan/route.js',
    'app/sitemap.js',
    'scripts/mcp-server.mjs',
  ];
  for (const path of requestPaths) {
    assert.doesNotMatch(
      read(path),
      /\bpublishedEvents\b/,
      `${path} must use a bounded/minimal query, never publishedEvents()`,
    );
  }
});

test('public catalog access is bounded and the sitemap is minimal plus cached', () => {
  const route = read('app/api/events/route.js');
  const sitemap = read('app/sitemap.js');
  const db = read('lib/db.js');

  assert.match(route, /publishedEventsPage/);
  assert.match(route, /pageLimit > 100/);
  assert.match(route, /next_cursor/);
  assert.match(sitemap, /sitemapEvents/);
  assert.match(sitemap, /revalidate = 86400/);
  assert.match(db, /SELECT id, updated_at\s+FROM events/);
});

test('public event projections cannot leak embeddings or geometry', () => {
  const db = read('lib/db.js');
  const projection = db.match(/const PUBLIC_EVENT_COLUMNS = sql`([\s\S]*?)`;/)?.[1] || '';

  assert.ok(projection, 'central public projection must exist');
  assert.doesNotMatch(projection, /\bembedding\b/);
  assert.doesNotMatch(projection, /\bgeom\b/);
  assert.doesNotMatch(db, /SELECT e\.\*/);
});
