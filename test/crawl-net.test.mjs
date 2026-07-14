// robots.txt parsing/matching (RFC 9309 subset). Run: node --test test/crawl-net.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, matchingRobotsGroup, isDisallowed } from '../lib/crawl-net.js';

const groupFor = (txt) => matchingRobotsGroup(parseRobots(txt));

test('trailing $ anchors the end of the path (was silently fail-open)', () => {
  const g = groupFor('User-agent: *\nDisallow: /*.pdf$\n');
  assert.equal(isDisallowed(g, '/files/report.pdf'), true);   // ends in .pdf → blocked
  assert.equal(isDisallowed(g, '/files/report.pdf?x=1'), false); // $ anchored → query tail not matched
  assert.equal(isDisallowed(g, '/pdf-guide/page'), false);    // .pdf not at the end → allowed
});

test('interior wildcard matches any run of characters', () => {
  const g = groupFor('User-agent: *\nDisallow: /a/*/private\n');
  assert.equal(isDisallowed(g, '/a/anything/here/private'), true);
  assert.equal(isDisallowed(g, '/a/private'), false);
});

test('longest match wins; allow beats disallow on a length tie (RFC 9309)', () => {
  const g = groupFor('User-agent: *\nDisallow: /events\nAllow: /events/public\n');
  assert.equal(isDisallowed(g, '/events/public/1'), false); // longer Allow wins
  assert.equal(isDisallowed(g, '/events/secret'), true);    // only Disallow matches
});

test('Cloudflare managed layout: Allow:/ keeps the site open, named-bot block stays scoped', () => {
  // The Stuttgart regression — an unparsed Allow used to merge the named-AI-bot
  // Disallow into the * group and read the whole site as closed.
  const txt = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n';
  assert.equal(isDisallowed(groupFor(txt), '/anything'), false);
});

test('strictest delay wins when multiple groups name the same agent', () => {
  // Two * groups, different crawl-delays — the merge must take the max, not the first.
  const g = groupFor('User-agent: *\nCrawl-delay: 2\n\nUser-agent: *\nCrawl-delay: 30\n');
  assert.equal(g.crawlDelayMs, 30000);
});
