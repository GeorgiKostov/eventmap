# Editor-written event descriptions

**Why:** the sitemap only lists events with a description of at least 30 characters
(`sitemapEvents` in `lib/db.js`, design doc §AI-readiness). Since the paid-AI shutdown
(2026-10-27) no crawler writes descriptions, so new events stopped reaching the sitemap:
on 2026-11-13, 0 of the 2,043 upcoming Linz-area events added in November qualified.
George decided (2026-11-14) that descriptions are written **by Claude Code or Codex/ChatGPT
running on his subscription**, interactively or as a scheduled task on his machine. Never
through a metered API (`lib/extract.js` stays disabled) and never with Gemini.

**Pieces:**
- `scripts/descriptions.mjs` moves data and calls no model: `stats`, `export`, `import`.
- `lib/editor-descriptions.js` holds the shared rules (series key, validation, excerpt).
- `lib/db.js`: recrawls keep an existing description (`COALESCE`), so a structured crawl
  that carries none no longer erases what an editor wrote.

## Run (≈20–40 min per batch of 150)

```bash
node --env-file=.env.local scripts/descriptions.mjs stats
node --env-file=.env.local scripts/descriptions.mjs export --limit 150
# write descriptions into tmp/descriptions/batch-<date>.json (rules below)
node --env-file=.env.local scripts/descriptions.mjs import tmp/descriptions/batch-<date>.json --dry-run
node --env-file=.env.local scripts/descriptions.mjs import tmp/descriptions/batch-<date>.json
```

`export` picks undescribed events in the sitemap catchments (Linz first, then the other
`SEO_CITIES`) that start in 2–45 days, groups each **series** (same title at the same place)
into one entry, puts seasonal titles first, and adds an `excerpt` of the source page fetched
politely through the crawler's robots-aware fetcher. `--city linz` narrows it.

`import` validates every text and writes it to all still-undescribed occurrences. It never
overwrites an existing description, so re-running a batch is safe. A rejected text is listed
with its reason and the exit code is 1: reword it and import again.

## Writing rules

For each entry, set `description`, or `skip: true`, or leave both alone.

1. **German, 1–2 sentences, 40–280 characters, your own words.** Say what it is, where, and
   for whom. The importer rejects any 7-word run shared with the excerpt (hard rule 1:
   facts + linkback, never copy).
2. **Only facts the title, venue or excerpt state.** No guessed atmosphere, prices, ages or
   programme. If the source says too little, leave the entry blank (hard rule 5).
3. **No dates, times, links, emails or phone numbers.** One text serves every date of the series.
4. **`skip: true`** for things that are not public events: room bookings ("Donausaal belegt"),
   office hours and Sprechtage, club-internal meetings or parties, entries marked `abgesagt`.
   Skipped series are stored in `meta.editor_description_skips` and not exported again.
5. A series that shows up under several towns (GEM2GO "Kiosk" listings) gets the same text.
   Name the place the source gives, not the listing town.

## Schedule

The Claude desktop scheduled task `okolo-event-descriptions` runs this daily on George's
machine, using his subscription. To pause it, disable that task. Codex can run the same steps
by hand. The batch files under `tmp/descriptions/` are scratch files and not committed.
