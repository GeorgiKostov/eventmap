import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Run the actual CLI and source-processing code; only external I/O is replaced.
const runner = `
  import { mock } from 'node:test';
  import { pathToFileURL } from 'node:url';
  const fixture = JSON.parse(process.env.CRAWL_TEST_FIXTURE);
  const sources = fixture.map((item, id) => ({
    id: String(id), name: 'Source ' + id, url: 'https://source-' + id + '.example/events',
    country: 'AT', town: 'Linz', feed_kind: 'jsonld', tier: 'active',
    crawl_count: 5, events_sum: 10, zero_streak: 0, ...item,
  }));
  const state = { marked: [], stats: [], writes: 0 };
  const fail = () => { throw new Error('Unexpected external I/O'); };
  globalThis.fetch = fail;
  const dbUrl = new URL('./lib/db.js', pathToFileURL(process.cwd() + '/'));
  const db = await import(dbUrl);
  mock.module(dbUrl, { namedExports: {
    ...Object.fromEntries(Object.keys(db).map((key) => [key, fail])),
    getSourcesForCrawl: async () => sources,
    updateSourceStats: async (id, stats) => state.stats.push({ id, ...stats }),
    updateSourceMeta: async () => {},
    markSourceCrawled: async (id) => state.marked.push(id),
    upsertEvent: async (event) => {
      if (sources.find((s) => s.name === event.title)?.outcome === 'storage-error') fail();
      state.writes++;
      return { id: String(state.writes), updated: true };
    },
    expireFinished: async () => 0,
    closeDb: async () => console.log('TEST_STATE ' + JSON.stringify(state)),
  } });
  const geocodeUrl = new URL('./lib/geocode.js', pathToFileURL(process.cwd() + '/'));
  mock.module(geocodeUrl, { namedExports: {
    ...(await import(geocodeUrl)),
    geocodeEvent: async (event) => sources.find((s) => s.name === event.title)?.outcome === 'no-geo'
      ? null : { lat: 48.3, lng: 14.3, geo_precision: 'venue' },
  } });
  const netUrl = new URL('./lib/crawl-net.js', pathToFileURL(process.cwd() + '/'));
  mock.module(netUrl, { namedExports: {
    ...(await import(netUrl)),
    robotsAllowed: async () => true,
    politeFetch: async (url) => {
      const source = sources.find((s) => s.url === url);
      if (!source) fail();
      if (source.outcome === '404') return new Response('', { status: 404 });
      if (source.outcome === 'unchanged') return new Response(null, { status: 304 });
      if (source.outcome === 'deferred') return new Response('Calendar information '.repeat(20));
      if (source.cms === 'naturfreunde') return Response.json({
        status: 'ok', items: [{ ev_id: source.id, title: source.name,
          date_str: '10.10.2026', lat: 48.3, lon: 14.3, link: source.url }],
      });
      return new Response('<script type="application/ld+json">' + JSON.stringify({
        '@type': 'Event', name: source.name, startDate: '2026-10-10T14:00',
      }) + '</script>');
    },
  } });
  process.argv = [process.execPath, process.cwd() + '/scripts/crawl.mjs', '--country', process.env.CRAWL_TEST_COUNTRY, '--mode', 'structured'];
  await import(pathToFileURL(process.argv[1]));
`;

function crawl(sources, country = 'AT') {
  const result = spawnSync(process.execPath, [
    '--experimental-test-module-mocks', '--input-type=module', '-e', runner,
  ], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, DATABASE_URL: '', CRAWL_TEST_FIXTURE: JSON.stringify(sources), CRAWL_TEST_COUNTRY: country },
  });
  assert.ifError(result.error);
  const state = result.stdout.match(/^TEST_STATE (.+)$/m);
  assert.ok(state, result.stderr + result.stdout);
  return { status: result.status, log: result.stdout, ...JSON.parse(state[1]) };
}

const repeat = (count, source) => Array.from({ length: count }, () => ({ ...source }));

test('dead-source recovery failures do not fail a productive crawl and return to quarantine', () => {
  const result = crawl([
    ...repeat(24, { tier: 'dead', zero_streak: 4, outcome: '404' }),
    ...repeat(14, {}),
  ]);
  assert.equal(result.status, 0, result.log);
  assert.equal(result.writes, 14);
  assert.equal(result.marked.length, 38);
  assert.doesNotMatch(result.log, /SYSTEMIC/);
});

test('regular-source outages still fail even with successful dead-source recoveries', () => {
  const result = crawl([...repeat(5, { outcome: '404' }), ...repeat(10, { tier: 'dead' })]);
  assert.equal(result.status, 1, result.log);
  assert.match(result.log, /SYSTEMIC: 5\/5/);
  assert.equal(result.marked.length, 10); // Regular fetch errors remain due.
});

test('sources newly classified dead return to quarantine after their failed fetch', () => {
  const result = crawl([{ zero_streak: 3, outcome: '404' }]);
  assert.equal(result.status, 0, result.log);
  assert.equal(result.stats[0].tier, 'dead');
  assert.deepEqual(result.marked, ['0']);
});

for (const tier of ['active', 'dead']) {
  for (const outcome of ['no-geo', 'storage-error']) {
    test(tier + ' zero-storage pipeline failures still trigger the alarm: ' + outcome, () => {
      const result = crawl(repeat(5, { tier, outcome }));
      assert.equal(result.status, 1, result.log);
      assert.match(result.log, /SYSTEMIC: 5\/5/);
      assert.equal(result.writes, 0);
      assert.deepEqual(result.marked, []);
      assert.deepEqual(result.stats, []);
      if (outcome === 'no-geo') assert.match(result.log, /Source 0.*1 missing geocode/);
    });
  }
}

test('Naturfreunde recovery storage failures remain retryable and alarm-eligible', () => {
  const result = crawl(repeat(5, { tier: 'dead', cms: 'naturfreunde', outcome: 'storage-error' }));
  assert.equal(result.status, 1, result.log);
  assert.match(result.log, /SYSTEMIC: 5\/5/);
  assert.deepEqual(result.marked, []);
  assert.deepEqual(result.stats, []);
});

test('unchanged and deferred sources do not dilute a regular-source outage', () => {
  const result = crawl([
    ...repeat(5, { outcome: '404' }),
    ...repeat(5, { outcome: 'unchanged' }),
    ...repeat(5, { outcome: 'deferred' }),
  ]);
  assert.equal(result.status, 1, result.log);
  assert.match(result.log, /SYSTEMIC: 5\/5/);
});

test('a half-failed regular batch remains below the existing alarm threshold', () => {
  const result = crawl([...repeat(3, { outcome: '404' }), ...repeat(3, {})]);
  assert.equal(result.status, 0, result.log);
  assert.equal(result.writes, 3);
});

test('valid candidates outside the source scope do not trigger the systemic alarm', () => {
  const result = crawl(repeat(5, { country: 'DE', region: 'Berlin 40km' }), 'DE');
  assert.equal(result.status, 0, result.log);
  assert.match(result.log, /1 outside berlin-40km skipped/);
  assert.doesNotMatch(result.log, /SYSTEMIC/);
  assert.equal(result.writes, 0);
  assert.deepEqual(result.marked, []);
  assert.deepEqual(result.stats, []);
});

test('outside-scope rounds do not dilute missing-geocode pipeline failures', () => {
  const scoped = { country: 'DE', region: 'Berlin 40km' };
  const result = crawl([
    ...repeat(5, { ...scoped, outcome: 'no-geo' }),
    ...repeat(10, scoped),
  ], 'DE');
  assert.equal(result.status, 1, result.log);
  assert.match(result.log, /SYSTEMIC: 5\/5/);
  assert.equal(result.writes, 0);
  assert.deepEqual(result.marked, []);
  assert.deepEqual(result.stats, []);
});
