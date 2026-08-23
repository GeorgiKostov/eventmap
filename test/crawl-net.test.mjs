// robots.txt parsing/matching (RFC 9309 subset). Run: node --test test/crawl-net.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  parseRobots, matchingRobotsGroup, isDisallowed, aiBotGroup, politeFetch, robotsAllowed,
} from '../lib/crawl-net.js';

const groupFor = (txt) => matchingRobotsGroup(parseRobots(txt));
// Historical classifier retained for audit evidence. Named third-party crawler
// blocks no longer gate OkoloBot; only groupFor()/robotsAllowed() decides that.
const aiBlocked = (txt, path = '/veranstaltungen') => isDisallowed(aiBotGroup(parseRobots(txt)), path);

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

// --- historical named-AI classification fixtures (read live 2026-07-16) ---

test('a dedicated ClaudeBot block does not apply to OkoloBot', () => {
  // www.stuttgart.de, verbatim shape. RFC 9309 says we may fetch (we are not
  // ClaudeBot) — that stays true; the policy is the separate question.
  const txt = 'User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n';
  assert.equal(isDisallowed(groupFor(txt), '/veranstaltungen'), false); // robots: allowed, correctly
  assert.equal(aiBlocked(txt), true);                                   // classified, not enforced
});

test('robots matching includes query strings', () => {
  const group = groupFor('User-agent: *\nDisallow: /*?print=1');
  assert.equal(isDisallowed(group, '/events?print=1'), true);
  assert.equal(isDisallowed(group, '/events?view=calendar'), false);
});

test('a redirect target gets its own robots authorization check', async (t) => {
  const blocked = http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *\nDisallow: /blocked');
    res.end('should never be fetched');
  });
  await new Promise((resolve) => blocked.listen(0, '127.0.0.1', resolve));
  const blockedPort = blocked.address().port;
  const origin = http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *\nAllow: /');
    res.writeHead(302, { Location: `http://127.0.0.1:${blockedPort}/blocked` });
    res.end();
  });
  await new Promise((resolve) => origin.listen(0, '127.0.0.1', resolve));
  t.after(() => { origin.close(); blocked.close(); });
  const url = `http://127.0.0.1:${origin.address().port}/start`;
  assert.equal(await robotsAllowed(url), true);
  await assert.rejects(() => politeFetch(url), /Redirect target disallowed/);
});

test('historical classifier finds AI bots in a kitchen-sink agent list', () => {
  // www.falkensee.de / www.teltow.de (byte-identical Brandenburg template): one
  // huge consecutive User-agent group, no `*` group at all, one Disallow: /.
  const txt = 'User-agent: dotbot\nUser-agent: AhrefsBot\nUser-agent: SemrushBot\n'
    + 'User-agent: ClaudeBot\nUser-agent: GPTBot\nUser-agent: meta-externalagent\nDisallow: /\n';
  assert.equal(isDisallowed(groupFor(txt), '/veranstaltungen'), false); // no * group → robots allows us
  assert.equal(aiBlocked(txt), true);
});

test('historical classifier excludes search crawlers', () => {
  // Huawei's PetalBot / Amazon's crawler. Counting these as an AI stance
  // wrongly condemned Linz-Termine (42 live events) when this was measured.
  const txt = 'User-agent: PetalBot\nDisallow: /\n\nUser-agent: Amazonbot\nDisallow: /\n';
  assert.equal(aiBlocked(txt), false);
});

test('historical classifier excludes a bytespider-only nuisance list', () => {
  // www.berlin.de: Bytespider sits beside AwarioSmartBot/cookiebot and NO AI
  // bot is named. Blocking on it would cost Berlin's official $0 JSON-LD portal.
  const txt = 'User-agent: AwarioSmartBot\nDisallow: /\n\nUser-agent: Bytespider\nDisallow: /\n'
    + '\nUser-Agent: cookiebot\nDisallow: /\n';
  assert.equal(aiBlocked(txt, '/events/'), false);
});

test('historical classifier preserves explicit AI-crawler Allow precedence', () => {
  const txt = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n';
  assert.equal(aiBlocked(txt), false); // allow wins on a length tie (RFC 9309)
});

test('historical classifier preserves scoped path rules', () => {
  // Naming an AI bot is not a blanket no — honor what they actually wrote.
  const txt = 'User-agent: GPTBot\nDisallow: /intern/\n';
  assert.equal(aiBlocked(txt, '/veranstaltungen'), false);
  assert.equal(aiBlocked(txt, '/intern/x'), true);
});

test('historical classifier has no opinion when no AI bot is named', () => {
  assert.equal(aiBotGroup(parseRobots('User-agent: *\nDisallow: /wp-admin/\n')), null);
  assert.equal(aiBlocked('User-agent: *\nDisallow: /wp-admin/\n'), false);
});
