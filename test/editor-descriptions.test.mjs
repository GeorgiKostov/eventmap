// Editor-written descriptions (lib/editor-descriptions.js, docs/ops/editor-descriptions.md).
// Run: node --test test/editor-descriptions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seriesKey, descriptionProblem, excerptFor } from '../lib/editor-descriptions.js';

const excerpt = 'Am Samstag lädt die Gemeinde Luftenberg ab 16:00 Uhr herzlich zum traditionellen '
  + 'Adventmarkt am Gemeindeplatz und im Forum Luftenberg ein! Freuen Sie sich auf Aussteller.';

test('one series per title and place, whatever the date or casing', () => {
  const a = seriesKey({ title: 'Advent am Dom', venue: 'Domplatz Mariendom', starts_at: '2026-11-21' });
  const b = seriesKey({ title: 'ADVENT AM DOM', venue: 'Domplatz  Mariendom', starts_at: '2026-12-05' });
  assert.equal(a, b);
  assert.notEqual(a, seriesKey({ title: 'Advent am Dom', venue: 'Pfarrheim' }));
  // Venue, then address, then town decides the place.
  assert.equal(seriesKey({ title: 'Punschstand', town: 'Katsdorf' }), 'punschstand|katsdorf');
});

test('accepts an original factual sentence', () => {
  assert.equal(descriptionProblem(
    'Traditioneller Adventmarkt in Luftenberg – am Gemeindeplatz sowie im Forum – mit vielen Ausstellern und Musik.',
    { title: 'Luftenberger Adventmarkt', excerpt },
  ), null);
});

test('rejects copied source wording (hard rule 1)', () => {
  assert.equal(descriptionProblem(
    'Traditioneller Adventmarkt am Gemeindeplatz und im Forum Luftenberg mit Musik.',
    { title: 'Luftenberger Adventmarkt', excerpt },
  ), 'copies source wording');
});

test('rejects text that cannot serve every occurrence or is unsafe to publish', () => {
  const opts = { title: 'Advent am Dom' };
  assert.match(descriptionProblem('Zu kurz.', opts), /shorter/);
  assert.match(descriptionProblem('x'.repeat(300), opts), /longer/);
  assert.match(descriptionProblem('Adventmarkt am Linzer Domplatz, Beginn am 21.11. mit Musik und Ständen.', opts), /date/);
  assert.match(descriptionProblem('Adventmarkt am Linzer Domplatz ab 16:00 Uhr mit Musik und vielen Ständen.', opts), /date/);
  assert.match(descriptionProblem('Adventmarkt am Linzer Domplatz, Infos unter www.example.at für alle.', opts), /link/);
  assert.match(descriptionProblem('Advent am Dom: Advent am Dom.', opts), /shorter|restates/);
  assert.match(descriptionProblem('Advent am Dom – Advent am Dom – Advent am Dom in Linz.', opts), /restates/);
  assert.equal(descriptionProblem(null, opts), 'missing');
});

test('excerpt starts at the visible body mention, not <title> or JSON-LD', () => {
  const page = 'Tag des Apfels - Rohrbach Startseite > Veranstaltungen Tag des Apfels Regionale Äpfel am Wochenmarkt.'
    + '\n{"name":"Tag des Apfels","description":"…"}';
  assert.ok(excerptFor(page, 'Tag des Apfels').startsWith('Tag des Apfels Regionale Äpfel'));
  assert.ok(excerptFor('{"name":"Nur JSON","x":1}', 'Nur JSON').startsWith('Nur JSON"'));
  assert.equal(excerptFor('Seite ohne Titel', 'Fehlt', 5), 'Seite');
  assert.equal(excerptFor('', 'x'), '');
});

test('a recrawl without a description keeps the one an editor wrote', () => {
  const db = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
  const at = db.search(/UPDATE events SET\s+title=\$\{ev\.title\}/);
  assert.ok(at > 0, 'upsertEvent UPDATE not found');
  assert.match(db.slice(at, at + 600), /description=COALESCE\(\$\{ev\.description \|\| null\}, description\)/);
});
