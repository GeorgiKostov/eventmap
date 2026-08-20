import test from 'node:test';
import assert from 'node:assert/strict';
import { channelForPoint } from '../lib/city-channels.js';

test('city navigation resolves only inside a channel catchment', () => {
  assert.equal(channelForPoint(48.3069, 14.2858)?.slug, 'linz');
  assert.equal(channelForPoint(48.65, 14.2858)?.slug, 'linz');
  assert.equal(channelForPoint(48.70, 14.2858), null);
  assert.equal(channelForPoint(47.5667, 14.2427), null); // Liezen countryside
});

test('overlapping catchments choose the nearest city channel', () => {
  assert.equal(channelForPoint(48.1575, 14.0289)?.slug, 'linz'); // Wels is inside Linz's 40 km channel
  assert.equal(channelForPoint(42.6977, 23.3219)?.slug, 'sofia');
});
