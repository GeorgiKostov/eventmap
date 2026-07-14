// Entity decoding — the cases that actually bit us in production.
// Run: node --test test/entities.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, stripTags, cleanText } from '../lib/entities.js';

test('numeric decimal entities (the 66-row production bug)', () => {
  assert.equal(decodeEntities('Sommerfest &#8211; Kramer in der Au'), 'Sommerfest – Kramer in der Au');
  assert.equal(decodeEntities('Forschen &#038; Entdecken'), 'Forschen & Entdecken');
});

test('hex entities', () => {
  assert.equal(decodeEntities('hex &#x2013; dash'), 'hex – dash');
  assert.equal(decodeEntities('&#x41;&#x42;'), 'AB');
});

test('named entities, incl. the ones the old partial lists missed', () => {
  assert.equal(decodeEntities("Hirschlos&apos;n Tour"), "Hirschlos'n Tour");
  assert.equal(decodeEntities('&ndash;&mdash;&hellip;'), '–—…');
  assert.equal(decodeEntities('&auml;&ouml;&uuml;&szlig;'), 'äöüß');
});

test('Cyrillic quote entities (Bulgarian sources)', () => {
  assert.equal(decodeEntities('Веселото &#8222;Хоро&#8220;'), 'Веселото „Хоро“');
  assert.equal(decodeEntities('фестивал &quot;Софийски&quot;'), 'фестивал "Софийски"');
});

test('double encoding (WordPress emits &#038; and &amp;#8211;)', () => {
  assert.equal(decodeEntities('Anhialo &amp;#8211; jazz'), 'Anhialo – jazz');
});

test('unknown entities are left alone, never mangled', () => {
  assert.equal(decodeEntities('unknown &bogus; stays'), 'unknown &bogus; stays');
});

test('invalid codepoints drop instead of throwing (one bad title must not kill a crawl)', () => {
  assert.doesNotThrow(() => decodeEntities('bad &#55296; surrogate'));
  assert.doesNotThrow(() => decodeEntities('bad &#1114112; out of range'));
});

test('stripTags turns a tag into a SPACE, so adjacent nodes never weld together', () => {
  // This is the shape of the "der ErdeDie progressiven Nostalgiker" corruption.
  assert.equal(stripTags('<h3>der Erde</h3><h3>Die progressiven</h3>'), 'der Erde Die progressiven');
});

test('cleanText normalizes NBSP + collapses whitespace, keeps the text', () => {
  assert.equal(cleanText('  Fest am Ort &#8211; heute  '), 'Fest am Ort – heute');
  assert.equal(cleanText(null), null);
  assert.equal(cleanText(undefined), undefined);
});

test('cleanText does not strip tag-like text (a title is not an HTML fragment)', () => {
  assert.equal(cleanText('Ich &lt;3 Linz'), 'Ich <3 Linz');
});
