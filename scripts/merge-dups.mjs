// One-off cross-source dedup pass over already-published events: the same
// real-world event listed by two different crawl sources (or scanned once
// after already being crawled) survives content_hash dedup because the
// extracted text differs — this clusters by the same criteria as
// lib/dedup.js's findDuplicate (same Vienna calendar day + same town/~300m +
// similar title), picks the oldest id per cluster as canonical, enriches it
// from its duplicates via mergePlan, and removes the newer rows.
//
// DRY-RUN by default — prints every proposed cluster, nothing is written.
// --write applies it.
// Usage: node --env-file=.env.local scripts/merge-dups.mjs
//        node --env-file=.env.local scripts/merge-dups.mjs --write
//
// Guards (see lib/dedup.js): recurring event series (same title/venue,
// different dates) never cluster — the same-day check requires an exact
// calendar-date match, not "same weekday" or "same series". Multi-day events
// only cluster with another listing that shares their starts_at day; a
// same event listed with different start dates across sources will NOT be
// caught here (out of scope — see report note below if it happens).
import { publishedEvents, updateEventFields, deleteEventsByIds, closeDb } from '../lib/db.js';
import { findDuplicate, mergePlan } from '../lib/dedup.js';

const WRITE = process.argv.includes('--write');

function clusterEvents(events) {
  const sorted = [...events].sort((a, b) => a.id - b.id);
  const consumed = new Set();
  const clusters = [];
  for (const e of sorted) {
    if (consumed.has(e.id)) continue;
    consumed.add(e.id);
    const group = [e];
    for (const b of sorted) {
      if (consumed.has(b.id)) continue;
      // Canonical-linkage: candidates are tested against the cluster canonical
      // only, NOT every member — single-linkage chaining let two long titles
      // sharing a boilerplate suffix ("… Das kostenlose Bewegungsprogramm ohne
      // Anmeldung") pull a different event (Traun Pilates) into the
      // Hantelkrafttraining cluster (review round 3).
      if (findDuplicate(b, [group[0]])) {
        group.push(b);
        consumed.add(b.id);
      }
    }
    if (group.length > 1) clusters.push(group);
  }
  return clusters;
}

function fmtEvent(ev) {
  return `#${ev.id} "${ev.title}" @ ${ev.starts_at} (${ev.town || '?'}) — ${ev.source_name || '?'} ${ev.source_url ? `<${ev.source_url}>` : ''}`;
}

async function main() {
  const events = (await publishedEvents()).filter((e) => e.kind === 'event');
  console.log(`Loaded ${events.length} published event(s).`);

  const clusters = clusterEvents(events);
  if (!clusters.length) {
    console.log('\nNo duplicate clusters found.');
    return;
  }
  console.log(`\n${clusters.length} duplicate cluster(s) found:\n`);

  const plan = []; // { canonicalId, patch, dropIds }
  for (const group of clusters) {
    const [canonicalOrig, ...dupsOrig] = group;
    let canonical = { ...canonicalOrig };
    const accPatch = {};
    for (const dup of dupsOrig) {
      const p = mergePlan(canonical, dup);
      Object.assign(accPatch, p);
      canonical = { ...canonical, ...p };
    }

    console.log(`Cluster (canonical = oldest id):`);
    console.log(`  KEEP   ${fmtEvent(canonicalOrig)}`);
    for (const dup of dupsOrig) console.log(`  DROP   ${fmtEvent(dup)}`);
    if (Object.keys(accPatch).length) {
      console.log(`  ENRICH ${JSON.stringify(accPatch)}`);
    } else {
      console.log(`  ENRICH (nothing — canonical already had every fillable field)`);
    }
    console.log('');

    plan.push({ canonicalId: canonicalOrig.id, patch: accPatch, dropIds: dupsOrig.map((d) => d.id) });
  }

  const totalDrops = plan.reduce((n, p) => n + p.dropIds.length, 0);
  console.log(`Summary: ${clusters.length} cluster(s), ${totalDrops} duplicate row(s) would be removed.`);

  if (WRITE) {
    console.log('\nApplying...');
    for (const { canonicalId, patch, dropIds } of plan) {
      if (Object.keys(patch).length) await updateEventFields(canonicalId, patch);
      const removed = await deleteEventsByIds(dropIds);
      console.log(`  cluster canonical #${canonicalId}: enriched + removed ${removed} row(s)`);
    }
    console.log('Done.');
  } else {
    console.log('\nDry run — no changes applied. Re-run with --write to apply.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
