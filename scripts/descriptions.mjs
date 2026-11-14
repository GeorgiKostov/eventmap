#!/usr/bin/env node
// Editor-written event descriptions — workflow in docs/ops/editor-descriptions.md.
// No model is called here: the writer is a Claude Code / Codex session on
// George's subscription (AI cost policy), and this script only moves data.
//
//   node --env-file=.env.local scripts/descriptions.mjs stats              # gap per city
//   node --env-file=.env.local scripts/descriptions.mjs export [--limit 150] [--from-days 2] [--days 45] [--city linz]
//   node --env-file=.env.local scripts/descriptions.mjs import <batch.json> [--dry-run]
//
// export writes tmp/descriptions/batch-<date>.json: one entry per series (same
// title at the same place) with its facts and a source excerpt for context.
// The writer fills each `description`; import validates (lib/editor-descriptions.js)
// and writes it to every still-undescribed occurrence. Exit 1 if any were rejected.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { undescribedEvents, setEditorDescription, viennaNow, metaGet, metaSet, closeDb } from '../lib/db.js';
import { SEO_CITIES } from '../lib/seo-pages.js';
import { politeFetch, robotsAllowed } from '../lib/crawl-net.js';
import { htmlToText } from './crawl.mjs';
import { seriesKey, excerptFor, descriptionProblem } from '../lib/editor-descriptions.js';
import { seasonalTheme } from '../lib/seasonal-events.js';

const args = process.argv.slice(2);
const command = args[0];
const val = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const days = Number(val('days', 45));
// Tomorrow's events gain nothing from a sitemap entry Google reads next week.
const fromDays = Number(val('from-days', 2));
const SKIP_KEY = 'editor_description_skips';
const loadSkips = async () => new Set(JSON.parse((await metaGet(SKIP_KEY)) || '[]'));
const cityArg = val('city', null);
const cities = cityArg ? SEO_CITIES.filter((c) => c.slug === cityArg) : SEO_CITIES;
if (cityArg && !cities.length) throw new Error(`Unknown --city ${cityArg}`);

function groupSeries(rows, skips = new Set()) {
  const bySeries = new Map();
  for (const row of rows) {
    const key = seriesKey(row);
    if (skips.has(key)) continue;
    if (!bySeries.has(key)) bySeries.set(key, { key, city: SEO_CITIES[row.city_rank]?.slug, rows: [] });
    bySeries.get(key).rows.push(row);
  }
  // Seasonal series first (the Advent/Christmas window is when people search),
  // then everything else soonest-first as the query returned it.
  const all = [...bySeries.values()];
  return [...all.filter((s) => seasonalTheme(s.rows[0])), ...all.filter((s) => !seasonalTheme(s.rows[0]))];
}

async function pageText(url) {
  try {
    if (!(await robotsAllowed(url))) return '';
    const res = await politeFetch(url);
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return '';
    return htmlToText(await res.text());
  } catch {
    return '';
  }
}

// One host at a time per worker so politeFetch's per-host delay holds.
async function fetchExcerpts(series) {
  const byHost = new Map();
  for (const s of series) {
    const host = new URL(s.rows[0].source_url).host;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(s);
  }
  const queue = [...byHost.values()];
  const cache = new Map();
  const worker = async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      for (const s of group) {
        const url = s.rows[0].source_url;
        if (!cache.has(url)) cache.set(url, await pageText(url));
        s.excerpt = excerptFor(cache.get(url), s.rows[0].title);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

async function stats() {
  const series = groupSeries(await undescribedEvents({ cities, fromDays, days }), await loadSkips());
  const perCity = new Map();
  for (const s of series) {
    const c = perCity.get(s.city) || { series: 0, events: 0 };
    c.series += 1; c.events += s.rows.length;
    perCity.set(s.city, c);
  }
  console.log(`Undescribed events starting in ${fromDays}–${days} days (sitemap catchments, skips excluded):`);
  for (const [city, c] of perCity) console.log(`  ${city.padEnd(10)} ${String(c.series).padStart(5)} series  ${String(c.events).padStart(6)} events`);
  console.log(`  ${'total'.padEnd(10)} ${String(series.length).padStart(5)} series  ${String(series.reduce((n, s) => n + s.rows.length, 0)).padStart(6)} events`);
}

async function exportBatch() {
  const limit = Number(val('limit', 150));
  const series = groupSeries(await undescribedEvents({ cities, fromDays, days }), await loadSkips()).slice(0, limit);
  await fetchExcerpts(series);
  const today = viennaNow().slice(0, 10);
  const out = val('out', path.join('tmp', 'descriptions', `batch-${today}.json`));
  const batch = {
    generated_at: viennaNow(),
    rules: 'docs/ops/editor-descriptions.md — fill "description"; set "skip": true for non-events; leave both alone to retry later.',
    series: series.map((s) => {
      const first = s.rows[0];
      return {
        key: s.key,
        city: s.city,
        ids: s.rows.map((r) => String(r.id)),
        title: first.title,
        venue: first.venue,
        address: first.address,
        town: first.town,
        categories: first.categories,
        is_free: first.is_free,
        age_min: first.age_min,
        age_max: first.age_max,
        indoor: first.indoor,
        occurrences: s.rows.length,
        first_starts: s.rows.slice(0, 3).map((r) => r.starts_at),
        source_url: first.source_url,
        excerpt: s.excerpt || '',
        description: null,
        skip: false,
      };
    }),
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(batch, null, 2)}\n`);
  const withExcerpt = batch.series.filter((s) => s.excerpt).length;
  console.log(`Wrote ${batch.series.length} series (${batch.series.reduce((n, s) => n + s.ids.length, 0)} events, ${withExcerpt} with excerpt) → ${out}`);
}

async function importBatch() {
  const file = args[1];
  if (!file || file.startsWith('--')) throw new Error('Usage: import <batch.json> [--dry-run]');
  const dryRun = args.includes('--dry-run');
  const batch = JSON.parse(await readFile(file, 'utf8'));
  let written = 0; let events = 0; let skipped = 0; const rejected = []; const newSkips = [];
  for (const s of batch.series || []) {
    if (s.skip === true) { newSkips.push(s.key); continue; }
    if (s.description == null || s.description === '') { skipped += 1; continue; }
    const problem = descriptionProblem(s.description, { title: s.title, excerpt: s.excerpt });
    if (problem) { rejected.push(`${s.title} — ${problem}`); continue; }
    written += 1;
    if (!dryRun) events += await setEditorDescription(s.ids, s.description.trim());
  }
  if (newSkips.length && !dryRun) {
    const skips = await loadSkips();
    for (const key of newSkips) skips.add(key);
    await metaSet(SKIP_KEY, JSON.stringify([...skips]));
  }
  console.log(`${dryRun ? '[dry run] ' : ''}${written} series accepted${dryRun ? '' : `, ${events} events updated`}; ${newSkips.length} marked not-an-event; ${skipped} left blank; ${rejected.length} rejected.`);
  for (const r of rejected) console.log(`  REJECTED ${r}`);
  if (rejected.length) process.exitCode = 1;
}

try {
  if (command === 'stats') await stats();
  else if (command === 'export') await exportBatch();
  else if (command === 'import') await importBatch();
  else throw new Error('Usage: descriptions.mjs stats|export|import — see file header');
} finally {
  await closeDb();
}
