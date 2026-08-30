import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clientPath = new URL('../app/partners/demo/partner-demo.js', import.meta.url);
const pagePath = new URL('../app/partners/demo/page.js', import.meta.url);
const stylesPath = new URL('../app/partners/demo/partner-demo.module.css', import.meta.url);

test('public partner demo keeps fictional programme outside production event paths', async () => {
  const [client, page] = await Promise.all([
    readFile(clientPath, 'utf8'),
    readFile(pagePath, 'utf8'),
  ]);

  assert.match(client, /const DEMO_EVENTS = \[/);
  assert.doesNotMatch(client, /fetch\s*\(/);
  assert.doesNotMatch(client, /\/api\/events|\/event\/\$\{/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /dynamic = 'force-static'/);
});

test('programme day tabs keep their full height inside the scrolling sidebar', async () => {
  const styles = await readFile(stylesPath, 'utf8');

  assert.match(styles, /\.dayTabs\s*\{[^}]*flex:\s*0 0 auto;/);
});
