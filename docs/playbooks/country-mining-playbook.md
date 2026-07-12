# Country Mining Playbook (EventMap / Okolo)

This playbook defines the repeatable process for expanding the event map to a new country while staying compliant with the core principles (facts + linkback, no fabrication, respectful crawling, Vienna/Sofia wall-clock times, source_url on every record).

## 1. Discovery Phase
- Obtain the **authoritative administrative list** from the national statistical institute (e.g., NSI Bulgaria → 265 общини across 28 области).
- Output: `municipalities-<cc>.json` with at minimum: name (official), region/oblast, district/obshina, website (official), population (optional), lat/lng centroid (optional).
- Do **not** use community or Wikipedia-derived lists as the source of truth.

## 2. Probing Phase (30–50 towns first)
- Probe a representative sample across districts and population sizes.
- For each probed site record:
  - `cms` fingerprint (gem2go, openagenda, typo3, custom, wordpress, etc.)
  - Presence of JSON-LD (schema.org/Event), iCal, RSS with event dates, structured table patterns.
  - robots.txt status and politeness notes.
  - Confidence (high/medium/low) that the site publishes future events.
- Output: `probed-<cc>.json`

## 3. Extraction Waterfall (same as Austria)
1. JSON-LD (schema.org/Event)
2. iCal / webcal
3. Country/CMS-specific parsers (GEM2GO variants, OpenAgenda, etc.)
4. RSS/Atom (only if explicit event date tags)
5. LLM fallback (strict schema, country-appropriate system prompt)

**Hard rules**:
- Times stored as Europe/Sofia (or local capital) wall-clock `YYYY-MM-DDTHH:MM`.
- All text fields kept in original language/script (Cyrillic for Bulgaria).
- Unknown fields = `null`. No date → skip the record.
- Every event **must** have `source_url`.

## 4. Geocoding & Deduplication
- Use the project's geocoder (Nominatim with proper UA).
- Dedup key: normalized title + date + town.
- Content hash stored for change detection.

## 5. Output Shapes
See `briefs/<country>-grok-kit.md` for the exact JSON schemas and a Cyrillic example.

## 6. Ingest
- Drop produced files into `data/catalog/` and `data/mined/`.
- Review CMS allowlist (Austria-calibrated).
- Register sources in DB.
- `npm run seed` (or equivalent ingest script).
- Verify per-region counts are non-zero.
- Legal note: facts-with-linkback posture carries to other EU countries; re-verify before public launch.

## 7. Scaling
Only after the probe batch shows viable yield and CMS patterns, proceed to the full 265 (or equivalent) municipality list.