# Weekend picks — editorial policy for every editor (human or AI)

> Status: **adopted 2026-11-12** · Code: `lib/pick-policy.js` (+ `rankPick` in `lib/source-quality.js`,
> `splitSections` in `lib/digest.js`) · Check: `scripts/check-picks.mjs` · Tests: `test/pick-policy.test.mjs`

One policy decides what goes into a weekend issue (newsletter, carousel, weekend page). The weekly
Codex run, a Claude session, George at the desk, or no AI at all, all start from the same deterministic
build and are judged by the same check. **Rules live in code, not in an automation prompt.** A rule
that exists only in one model's prompt is ignored by the next model and can't be tested.

## Why (audit 2026-11-12)

The Linz family strand was five Alpenverein climbing *courses* on two consecutive weekends,
including "Sicherungsworkshop ab 14" and Sept→March series. Theater des Kindes, a Leonding
*Nussknacker* and a Kuddelmuddel puppet show sat unpicked at ranks 42–48. The prompt-based editorial
pass did not catch it. The ranking knew family/source trust/precision but not "is this an outing
this weekend", and its last tiebreak (earliest start) rewarded the *oldest* long-running series.
Brucknerhaus and Posthof ranked below Linz-Termine's "Dance Night" purely on source tier.

## The pipeline

1. **Build.** `buildDigest` → `weekendPicks` (pool) → `rankPick` (order) → `splitSections` (two
   strands, diversity caps). Deterministic. No model involved.
2. **Check.** `node --env-file=.env.local scripts/check-picks.mjs --channel <slug>` prints every
   frozen pick with `BLOCK`/`warn` flags, active-season coverage, and the policy's current picks that
   the issue lacks. It exits 1 on any BLOCK flag. Use `--friday YYYY-MM-DD` for another weekend.
3. **Editorial pass (the AI's job).** Swap every BLOCK pick, then decide each warn flag and apply the
   judgment list below. Swap with the desk's *Replace* button (or `applyReplace` + `saveDigest`),
   which takes the next policy candidate in the same strand. Do not hand-pick from outside the pool.
4. **Copy.** Write subject/intro/teasers from stored facts only (hard rules 1 and 5).
5. **Re-run the check** and include its summary in the run report. Publish only at exit 0.

## Rules the code enforces

| Rule | Where | Effect |
|---|---|---|
| Municipal notices (Grünschnitt, Generalversammlung, Sparverein-Auszahlung, Blutspende…) | `ADMIN_RE` | removed from pool |
| Courses, trainings, standing groups, services (Lehrgang, Beratung, Gruppenstunde, "Termin N", Kurs/Training/Treff spanning >3 days) | `isRoutine` | ranked below every non-routine row; BLOCK flag |
| Family strand = children. `age_min ≥ 14` is not a family pick (map's kids filter stays broad) | `isFamilyPick` | goes to the "all" strand; BLOCK if frozen in family |
| Occasion: short dated event (≤3 days), market/festival, or in-month seasonal title | `isOccasion` | ranks above source tier; months-long listings warn |
| Findable: venue or town | `hasPlace` | ranks above source tier |
| Local: within 15 km of the edition centre | `isNear` | after source tier |
| Seasonal (title match, `lib/seasonal-events.js`) | `rankPick` | after tier and distance, so big local markets lead |
| Specific: place + start time (or all-day / multi-day) | `isSpecific` | tiebreak-level |
| One show once (venue variants, "Termin 1/2"); ≤2 per venue; ≤3 per season per issue | `takeDiverse` | skipped, used only to top up a short issue |
| Major venue programmes (Brucknerhaus, Posthof, Theater des Kindes, Landestheater, Schlachthof Wels) | `CURATED_NAME_PATTERNS` | curated tier |

Rank tuple (lexicographic, never a weighted sum): family-for-children → not routine → occasion →
has place → source tier → near → seasonal → specific → free → interest → shorter span → soonest.

## Judgment the code can't make (check these by reading)

- **Near-duplicates the key misses:** "Pre-Concert für X" plus "X"; the same reading listed under
  three spellings. Keep one.
- **Not an outing:** restaurant promos ("Wildwochen", "Freitag gibt's Burger"), sales, school open
  days, parish/club internals, bookable courses that read like events.
- **Audience:** the family strand must suit children. A holiday title is not evidence of that, and
  neither is the source category "für Kinder". Check the title and age facts.
- **Usefulness this weekend:** prefer something a family can just go to. A sold-out or
  registration-only course is a poor pick even if it is dated.
- **Truth:** when a source's label conflicts with the content (Linz-Termine feed "— Halloween" on a
  dance night), trust the title and our own facts, never the feed label.
- **Seasons:** when the check prints `season_missing` and the pool holds real local seasonal events,
  swap one in. Never pad with weak seasonal items, and never invent or carry last year's dates.
- **Shortage:** below `DIGEST_MIN` good picks, report the shortage. Do not publish a weak issue.

## Changing the rules

Found a recurring bad pick? Fix it in `lib/pick-policy.js` with a test case taken from the real row,
update the table above, and run the check on Linz and Wien before/after. Do not add the rule to an
automation prompt only. Keep everything title-based and factual (hard rule 5). Do not rank by paid
highlight (P2B, `docs/decisions/2026-07-12-paid-placement-compliance.md`).
