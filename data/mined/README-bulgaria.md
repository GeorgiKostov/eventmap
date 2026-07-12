# Where Bulgaria's mined output goes

Grok mines Bulgaria externally per `docs/playbooks/country-mining-playbook.md` and
`briefs/bulgaria-grok-kit.md`. This file is the drop-zone map + ingest commands for
what comes back. See `briefs/bulgaria-grok-kit.md` §(b) for the full run-kit; this is
the short version to keep next to the files themselves.

## Where each artifact goes

| Artifact | Path | Replaces/extends |
|---|---|---|
| Full municipality catalog (265 rows) | `data/catalog/municipalities-bg.json` | the 2-row stub committed here |
| Probe results (cms + confidence per site) | `data/catalog/probed-bg.json` | new file, shape mirrors `data/catalog/probed-all-1823.json` (`{ proposed: [...] }`, each row `{ name, url, region, cms, confidence, ... }`) |
| Mined events, one file per batch | `data/mined/events-bg-<batch>.json` | e.g. `events-bg-sofia.json`, `events-bg-plovdiv.json` — shape: `{ source_registry: [...], events: [...] }`, every event and source row carries `"country": "BG"` |

`data/mined/*.json` is scanned as a whole directory by `npm run seed` — dropping a
new `events-bg-*.json` file there does not require any code change, it's picked up
automatically alongside the existing Austrian files.

## Ingest commands (run in this order)

```bash
# 1. Register sources from the probe results (dry run first — prints counts/samples, writes nothing)
node --env-file=.env.local scripts/register-probed.mjs --file data/catalog/probed-bg.json
# then for real:
node --env-file=.env.local scripts/register-probed.mjs --file data/catalog/probed-bg.json --write

# 2. Seed events (reads every file in data/mined/*.json, including events-bg-*.json)
npm run seed

# 3. Verify — per-oblast (region) published counts, not just a national total.
# The "silent zero" lesson (docs/playbooks/country-mining-playbook.md §3h): a clean
# run can still publish 0 events for a whole oblast with no error anywhere in the
# log. Always check the per-region breakdown, never just the aggregate.
```

For step 3, a quick per-oblast check (adjust the column — `sources.region` is the
област for a given source; events don't carry their source's region directly, so
join through `source_name`/`source_url`, or for a fast approximation group by
`events.town`):

```sql
select region, count(*) from sources where country='BG' group by region order by 2 desc;
select town, count(*) from events where country='BG' and status='published' group by town order by 2 desc;
```

Note `register-probed.mjs`'s current selection policy (`confidence='high'` any CMS,
or `confidence='medium'` only for `cms in ('gem2go','ris')`) is Austria-calibrated —
those two CMS names won't mean anything for Bulgaria's probe results. George should
review the policy in that script before running `--write` for Bulgaria; the
Bulgaria-specific CMS names (whatever the probe pass finds — see
`briefs/bulgaria-grok-kit.md`) aren't in that allowlist yet.
