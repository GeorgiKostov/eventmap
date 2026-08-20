import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREGENZER_ACTION_IDS,
  BREGENZER_FESTSPIELE_SCHEDULE_URL,
  discoverBregenzerActionIds,
  fetchBregenzerFestspieleEvents,
  parseBregenzerEventsResponse,
  parseBregenzerProductionsResponse,
} from '../lib/bregenzer-festspiele-events.js';

const EVENTS_RESPONSE = `0:{"a":"$@1"}
1:${JSON.stringify({
  events: [
    {
      id: 12190,
      title: 'La traviata',
      start: '2026-08-23T21:00:00+02:00',
      productionNumber: 447,
      venueName: 'Seebühne',
      performanceLocationName: 'Seebühne',
      genreName: 'Musiktheater See',
      url: '',
    },
    {
      id: 12501,
      title: 'Führung',
      start: '2026-08-23T15:30:00+02:00',
      productionNumber: 53,
      venueName: 'Festspielgelände',
      performanceLocationName: 'Festspielgelände',
      genreName: 'Führungen',
      url: '',
    },
  ],
})}`;

const PRODUCTIONS_RESPONSE = `0:{"a":"$@1"}
1:${JSON.stringify({
  447: {
    color: '#FF6A38',
    group: 'a',
    data: {
      de: [{ path: '/de/musiktheater/la-traviata' }],
    },
  },
})}`;

test('discovers the current action names from a Next bundle', () => {
  assert.deepEqual(
    discoverBregenzerActionIds(`
      let a=createServerReference("new-events-id",Y.callServer,void 0, "fetchRedisData");
      let b=createServerReference('new-productions-id',Y.callServer,void 0, 'fetchProductions');
    `),
    { events: 'new-events-id', productions: 'new-productions-id' },
  );
});

test('parses event facts and joins official production detail paths', () => {
  const productions = parseBregenzerProductionsResponse(PRODUCTIONS_RESPONSE);
  const events = parseBregenzerEventsResponse(EVENTS_RESPONSE, {
    url: BREGENZER_FESTSPIELE_SCHEDULE_URL,
    town: 'Bregenz',
  }, productions);

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    title: 'La traviata',
    date_start: '2026-08-23',
    time_start: '21:00',
    date_end: null,
    time_end: null,
    venue: 'Seebühne',
    address: null,
    town: 'Bregenz',
    categories: ['music', 'culture'],
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    description: null,
    source_url: 'https://bregenzerfestspiele.com/de/musiktheater/la-traviata',
  });
  assert.equal(events[1].source_url, BREGENZER_FESTSPIELE_SCHEDULE_URL);
  assert.equal(events[1].description, null);
});

test('fails closed on malformed or undated action payloads', () => {
  assert.deepEqual(parseBregenzerEventsResponse('1:{"events":[{"title":"No date"}]}'), []);
  assert.deepEqual(parseBregenzerEventsResponse('not an RSC response'), []);
  assert.deepEqual(parseBregenzerProductionsResponse('not an RSC response'), {});
});

test('fetches discovered actions and returns an empty result when the action is unavailable', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith('/schedule.js')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return 'createServerReference("discovered-events",Y.callServer,void 0,"fetchRedisData")';
        },
      };
    }
    if (!options.method) {
      return {
        ok: true,
        status: 200,
        async text() { return '<script src="/_next/static/chunks/schedule.js"></script>'; },
      };
    }
    if (options.headers['Next-Action'] === 'discovered-events') {
      return { ok: true, status: 200, async text() { return EVENTS_RESPONSE; } };
    }
    if (options.headers['Next-Action'] === BREGENZER_ACTION_IDS.productions) {
      return { ok: true, status: 200, async text() { return PRODUCTIONS_RESPONSE; } };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const events = await fetchBregenzerFestspieleEvents({
    url: BREGENZER_FESTSPIELE_SCHEDULE_URL,
    town: 'Bregenz',
  }, { fetchImpl, robotsFn: async () => true });
  assert.equal(events.length, 2);
  assert.equal(calls.find((call) => call.options.method === 'POST').options.body, '[]');
  assert.equal(calls.find((call) => call.options.method === 'POST').options.headers.Accept, 'text/x-component');
  assert.equal(events[0].source_url, 'https://bregenzerfestspiele.com/de/musiktheater/la-traviata');

  const unavailable = await fetchBregenzerFestspieleEvents({ url: BREGENZER_FESTSPIELE_SCHEDULE_URL }, {
    fetchImpl: async (url, options = {}) => {
      if (!options.method) return { ok: true, status: 200, async text() { return '<html></html>'; } };
      return { ok: false, status: 404, async text() { return ''; } };
    },
    robotsFn: async () => true,
  });
  assert.deepEqual(unavailable, []);
});
