// robots.txt parsing/matching (RFC 9309 subset). Run: node --test test/crawl-net.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRobots, matchingRobotsGroup, isDisallowed, aiBotGroup,
} from '../lib/crawl-net.js';

const groupFor = (txt) => matchingRobotsGroup(parseRobots(txt));
// The two questions crawl.mjs asks per source: may WE fetch (RFC 9309), and did
// the site shut out AI crawlers (our own policy, docs/decisions/2026-07-16-ai-bot-policy.md).
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

// --- named-AI-crawler policy (all fixtures are REAL robots.txt shapes, read live 2026-07-16) ---

test('ai policy: a dedicated ClaudeBot block is honored even though it never names us', () => {
  // www.stuttgart.de, verbatim shape. RFC 9309 says we may fetch (we are not
  // ClaudeBot) — that stays true; the policy is the separate question.
  const txt = 'User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n';
  assert.equal(isDisallowed(groupFor(txt), '/veranstaltungen'), false); // robots: allowed, correctly
  assert.equal(aiBlocked(txt), true);                                   // policy: honored
});

test('ai policy: a 90-agent kitchen-sink list still counts when it names an AI bot', () => {
  // www.falkensee.de / www.teltow.de (byte-identical Brandenburg template): one
  // huge consecutive User-agent group, no `*` group at all, one Disallow: /.
  const txt = 'User-agent: dotbot\nUser-agent: AhrefsBot\nUser-agent: SemrushBot\n'
    + 'User-agent: ClaudeBot\nUser-agent: GPTBot\nUser-agent: meta-externalagent\nDisallow: /\n';
  assert.equal(isDisallowed(groupFor(txt), '/veranstaltungen'), false); // no * group → robots allows us
  assert.equal(aiBlocked(txt), true);
});

test('ai policy: search crawlers are NOT AI crawlers', () => {
  // Huawei's PetalBot / Amazon's crawler. Counting these as an AI stance
  // wrongly condemned Linz-Termine (42 live events) when this was measured.
  const txt = 'User-agent: PetalBot\nDisallow: /\n\nUser-agent: Amazonbot\nDisallow: /\n';
  assert.equal(aiBlocked(txt), false);
});

test('ai policy: a bytespider-only nuisance list is not an AI stance (George, 2026-07-16)', () => {
  // www.berlin.de: Bytespider sits beside AwarioSmartBot/cookiebot and NO AI
  // bot is named. Blocking on it would cost Berlin's official $0 JSON-LD portal.
  const txt = 'User-agent: AwarioSmartBot\nDisallow: /\n\nUser-agent: Bytespider\nDisallow: /\n'
    + '\nUser-Agent: cookiebot\nDisallow: /\n';
  assert.equal(aiBlocked(txt, '/events/'), false);
});

test('ai policy: an explicit ClaudeBot Allow beats another AI bot\'s Disallow', () => {
  const txt = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n';
  assert.equal(aiBlocked(txt), false); // allow wins on a length tie (RFC 9309)
});

test('ai policy: a SCOPED AI block only covers the paths it names', () => {
  // Naming an AI bot is not a blanket no — honor what they actually wrote.
  const txt = 'User-agent: GPTBot\nDisallow: /intern/\n';
  assert.equal(aiBlocked(txt, '/veranstaltungen'), false);
  assert.equal(aiBlocked(txt, '/intern/x'), true);
});

test('ai policy: no AI bot named → no opinion, never blocks', () => {
  assert.equal(aiBotGroup(parseRobots('User-agent: *\nDisallow: /wp-admin/\n')), null);
  assert.equal(aiBlocked('User-agent: *\nDisallow: /wp-admin/\n'), false);
});
