import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp } from '../lib/public-ip.js';
import { isSameOriginMutation } from '../lib/request-security.js';

function request({ origin, site } = {}) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  if (site) headers.set('sec-fetch-site', site);
  return { url: 'https://www.okolo.events/api/events', headers };
}

test('mutation guard rejects cross-origin browsers and malformed origins', () => {
  assert.equal(isSameOriginMutation(request({ origin: 'https://www.okolo.events', site: 'same-origin' })), true);
  assert.equal(isSameOriginMutation(request({ origin: 'https://evil.example', site: 'cross-site' })), false);
  assert.equal(isSameOriginMutation(request({ origin: 'not a url' })), false);
  assert.equal(isSameOriginMutation(request()), true);
});

test('URL intake accepts public unicast IPs and blocks non-public ranges', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicIp(ip), true, `${ip} should be public`);
  }
  for (const ip of [
    '127.0.0.1', '10.2.3.4', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1',
    'fc00::1', 'fe80::1', 'fec0::1', 'ff02::1', '2001:db8::1', '2001::1',
    '2002:7f00:1::', '3fff::1', 'not-an-ip',
  ]) assert.equal(isPublicIp(ip), false, `${ip} should be blocked`);
});
