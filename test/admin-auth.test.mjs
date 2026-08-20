import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerTokenValid } from '../lib/admin-auth.js';

const request = (authorization) => ({
  headers: { get: (name) => name === 'authorization' ? authorization : null },
});

test('bearerTokenValid accepts the configured service token only in Authorization', () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = '0123456789abcdef';
  try {
    assert.equal(bearerTokenValid(request('Bearer 0123456789abcdef')), true);
    assert.equal(bearerTokenValid(request('Bearer wrong-token')), false);
    assert.equal(bearerTokenValid(request(null)), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});
