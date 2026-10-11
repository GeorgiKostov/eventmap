# TypeSafe advisory trial

Added 2026-09-17 with user authorization and a combined $0.50 cap shared with Spomen.

```powershell
node scripts/typesafe-trial.mjs
node scripts/typesafe-trial.mjs --live --resume
```

Default is dry-run. Uses the sibling Project Brain tool, not a deployed package. [Full setup and limitations](../../../../Project%20Brain/Company/Tools/Typesafe%20Trials/README.md).

40 synthetic German source/record pairs check unsupported admission, venue, indoor/outdoor, minimum-age and category claims. These are assistant-authored fixtures, not harvested sources or production records. There is no crawl, database access, source registration, publication or runtime extraction change. The production provider boundary remains `lib/extract.js`.

JSON/JSONL reports and the shared retained-reservation ledger live under Project Brain's `Company/Tools/Typesafe Trials/data`. The current production extractor was not benchmarked or replaced. Review misses and false alarms before proposing integration; preserve deterministic parsing and unknown values.
