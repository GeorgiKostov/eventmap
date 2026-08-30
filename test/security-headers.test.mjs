import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.mjs';

function headerValue(rule, key) {
  return rule.headers.find((header) => header.key === key)?.value;
}

test('only the fictional partner showcase can be embedded', async () => {
  const rules = await nextConfig.headers();
  const productRule = rules.find((rule) => rule.source.includes('(?!partners'));
  const partnerRule = rules.find((rule) => rule.source === '/partners/:path*');

  assert.ok(productRule);
  assert.equal(headerValue(productRule, 'X-Frame-Options'), 'DENY');
  assert.match(headerValue(productRule, 'Content-Security-Policy'), /frame-ancestors 'none'/);

  assert.ok(partnerRule);
  assert.equal(headerValue(partnerRule, 'X-Frame-Options'), undefined);
  assert.match(headerValue(partnerRule, 'Content-Security-Policy'), /frame-ancestors \*/);
});
