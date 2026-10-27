import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

test('every automated AI entrypoint blocks network and CLI calls despite provider credentials/overrides', async (t) => {
  // Install the process stub before importing extract.js: it captures execFile
  // through promisify at module load time. Nothing in this test can start a CLI.
  const network = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected model network request');
  });
  const cli = t.mock.method(childProcess, 'execFile', (...args) => {
    args.at(-1)(new Error('Unexpected model CLI invocation'));
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

  const ai = await import('../lib/extract.js');
  const { embedTexts } = await import('../lib/embed.js');
  const keys = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'EXTRACT_PROVIDER', 'EXTRACT_FALLBACK', 'MAX_LLM_CALLS'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const calls = {
    extractFromImage: { base64: 'dGVzdA==', mediaType: 'image/png', filePath: '/tmp/test-poster.png' },
    extractFromPage: { text: 'Event text', sourceName: 'Test venue', town: 'Linz' },
    extractSingleFromText: { text: 'Event text', contextUrl: 'https://example.com/event' },
    extractLocationFromText: { text: 'Venue text', title: 'Test event', town: 'Linz' },
    searchVenueAddress: { venue: 'Test venue', town: 'Linz' },
  };
  for (const credentials of [false, true]) {
    for (const provider of ['', 'grok', 'ollama', 'gemini', 'claude']) {
      for (const key of keys.slice(0, 3)) {
        if (credentials) process.env[key] = 'test-key-must-never-be-used';
        else delete process.env[key];
      }
      process.env.EXTRACT_PROVIDER = provider;
      process.env.EXTRACT_FALLBACK = 'none';
      process.env.MAX_LLM_CALLS = '750';
      for (const [name, args] of Object.entries(calls)) {
        await assert.rejects(ai[name](args), (err) => {
          assert.equal(ai.isAutomatedAiDisabled(err), true, `${name}, provider=${provider}, keys=${credentials}`);
          assert.match(err.message, /interactively in Codex/);
          return true;
        });
      }
      assert.equal(await ai.writeDigestCopy({ city: 'Linz', lang: 'de', weekendLabel: 'Test weekend', events: [] }), null,
        'digest keeps its deterministic template fallback');
      assert.deepEqual(await embedTexts([]), [], 'an empty embedding batch stays a no-op');
      await assert.rejects(embedTexts(['Event text']), ai.isAutomatedAiDisabled,
        'nonempty embedding batches cannot call Gemini, even with a key');
    }
  }
  assert.equal(network.mock.callCount(), 0, 'no provider network call');
  assert.equal(cli.mock.callCount(), 0, 'no Claude/Grok background CLI');
  assert.equal(ai.isAutomatedAiDisabled(new Error('timeout')), false);
});
