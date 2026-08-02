import test from 'node:test';
import assert from 'node:assert/strict';
import { publicBaseUrl, publicUrl } from '../lib/public-url.js';

test('normalizes the production host and removes a trailing slash', () => {
  assert.equal(publicBaseUrl('https://okolo.events/'), 'https://www.okolo.events');
  assert.equal(publicUrl('/event/7', 'https://okolo.events/'), 'https://www.okolo.events/event/7');
});

test('preserves configured local and preview hosts', () => {
  assert.equal(publicBaseUrl('http://localhost:3311/'), 'http://localhost:3311');
  assert.equal(publicUrl('sitemap.xml', 'https://preview.example/'), 'https://preview.example/sitemap.xml');
});
