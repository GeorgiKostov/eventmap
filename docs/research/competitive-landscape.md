# Competitive landscape — event discovery tools & apps

> Status: living research doc · Owner: Architect (researcher role) · Started: 2026-07-11
> Purpose: know exactly what has been tried, what died, what survived, and what the gap is — so we
> don't rediscover a grave. Companion to the strategy in `docs/design/design-doc.md` §2/§8 and the
> Malkin post-mortem analysis (see `tasks/lessons.md` / session notes).
>
> **Verification status:** the 2011–2016 US graveyard is well-grounded (Hugh Malkin's 2015 essay
> "Why no one has solved event discovery" + its comment thread of founders). Recent apps and DACH
> specifics marked **[verify]** are from memory / prior-session notes and need a live check before we
> quote them to anyone. Do not cite [verify] numbers externally until confirmed.

---

## 1. Why this matters

Event discovery is a **startup graveyard**. Y Combinator reportedly told Malkin they'd had an
event-discovery company in almost every cohort and none succeeded. The category dies on two things,
not on features:

1. **Retention / low frequency** — ~90% of people look for events ≤ once a week; no habit forms, users
   forget the app exists. Frequency ≠ retention (the ones that survive have a strong *external trigger*).
2. **Supply completeness / cold start** — most people never create events; creators won't post to a
   small platform; everyone aggregates the *same* feeds, so supply is a commodity with no moat.

Every tool below is a data point on one or both. Read this alongside the two things that are *new
since 2015* and are our actual wedge: LLM extraction of the un-aggregated long tail, and a tight
single-region family niche.

---

## 2. The graveyard (2011–2016, mostly US) — well-grounded

| Tool | What it was | What happened / lesson |
|------|-------------|------------------------|
| **HugeCity** (Malkin) | Map of what's happening around you, Facebook-events-fed | ~1M visitors/mo, **died on retention**, sold to Time Out. The source of most of our lessons. |
| **Eventful** (Brian Dear) | Early large event aggregator + "Demand It!" | Pioneer, drifted off-mission. Founder's lament: organizers publish **no structured data** → discovery is unsolvable at the source. |
| **Plancast** | Social "what are you attending" sharing | Post-mortem (Hendrickson, 2012) coined the planners-vs-procrastinators framing. Died on sharing frequency. |
| **Sosh** | Heavily *curated* city things-to-do | Best product of its era per peers; curation made **per-city expansion too slow/costly**. |
| **YPlan** | Tonight-only curated bookings (procrastinator play) | Raised big, **sold to Time Out (2016) for far less than raised**. |
| **goby** (Mark Watkins) | Things-to-do discovery | ~1M/mo, #1 app briefly, **stalled — "not a daily use case, it's a feature not a product."** |
| **Nearify** | Nearby events discovery + taste picker | Malkin's note: radius too wide; people want ~5mi. |
| **UpOut** | SF curated guide | Comment thread: the money is in the **top 10% ticketed events that don't need discovery**; the bottom 90% that need it **can't pay** → ad model fails. |
| **Eventot** | HugeCity clone | Same conclusions, shut 2011–2014. |
| **Upcoming.org** | Beloved pre-smartphone event site (Yahoo) | Killed, briefly revived. Nostalgia benchmark. |
| **5 Everyday** | LA, 5 curated things/day (artist-curated) | Malkin liked it for procrastinators; **curation doesn't scale past one city cheaply**. |
| **Lanyrd / Active** | Niche: conferences / athletic events | Malkin's "niche thyself" success cases — proof the escape hatch is *narrowing*. |
| **Google Schemer** | Google's things-to-do experiment | Shut down. Even Google couldn't will it. |
| **IRL** | Social events app (later pivots) | Later notoriety aside, another retention casualty. |

**Cross-cutting founder quotes worth remembering:** "it's a feature, not a product" (Watkins);
"go for quality not quantity" (Vahe/Eventot); "going out is a group decision 99% of the time" (Dave/
3 Kinds of Ice); Facebook "can afford to sit on the sidelines and copy whatever works" (Malkin).

---

## 3. Survivors & who actually won which slice (current)

The category was never "won" as discovery — it fragmented into defensible **sub-jobs**:

- **Fever** — curated *commercial* city experiences (Candlelight concerts, immersive shows). Won by
  owning **supply it co-produces + a paid-experiences model**, not neutral discovery. [verify: scale]
- **Eventbrite** — self-serve ticketing with discovery attached. Owns the *creation* tool for the
  long-tail organizer; discovery is a byproduct of ticketing.
- **Meetup** — recurring *groups*, not one-off events. Solved retention via the **group/recurrence**
  hook (a standing reason to return) — a real lesson for us.
- **Partiful** — *private* events / invites, Gen-Z. Won the **hosting + group-coordination** job
  (the "going out is a group decision" insight), sidestepping discovery entirely. [verify: current status]
- **Facebook / Instagram Events** — still the 450M-user gorilla; still **weak at discovery** by choice.
  The latent threat, not an active competitor. Building on their data = building in their playground.
- **Google** — "Things to do" + **event rich results** eat structured data directly. This is the
  **self-disintermediation threat** (design-doc §11.6): if we emit perfect JSON-LD, Google can answer
  from the source and skip us. Frenemy, not peer.
- **Time Out** — editorial "things to do" media; monetizes via traffic→ads. Where Malkin ended up.

**Pattern:** every survivor won by picking a *sub-job* (ticketing, groups, private hosting, curated
commercial experiences, editorial) — none by being neutral "discover everything near me." That's the
strongest argument for our narrow family+region framing.

---

## 4. DACH / Austria-specific — closest to our turf **[verify all]**

- **Familienkarte (Land OÖ)** — *our exact audience in our exact region*, government-backed, family
  events + discounts. The one to study hardest: it's both the closest competitor **and** the cheapest
  legal data path / first B2B partnership target (design-doc §11.2). Likely government-grade UX =
  our product opening. Are they a partner or a rival? Open question.
- **Rausgegangen (DE)** — city event aggregator/magazine, multiple German cities. Closest "published-
  event aggregation" incumbent culturally near us. [verify: coverage in AT / OÖ]
- **AllEvents.in** — global aggregator, has AT listings; breadth over curation (Malkin's "quantity not
  quality" trap). Shows what *undifferentiated aggregation* looks like.
- **oeticket / Eventim** — ticketing incumbents; own the top-10% commercial events (the ones that don't
  need discovery). Potential commercial-layer data source, not a discovery rival.
- **linztermine.at** — the *city-run* Linz calendar. A source we already crawl, and a benchmark for
  "official but not family-lensed, not a map, no AI surface."
- **OpenActive (UK)** — the open activity/event data standard. **Nothing equivalent exists in DACH** —
  that absence is our stated opening (design-doc §8).

---

## 5. The scan-a-poster mechanic — direct-analog watch **[verify all]**

Our poster-scan feature has near-direct analogs; none combine it with crawled supply + regional density:

- **LocalPosters** — reportedly the closest direct mechanic: photograph a poster → AI extracts →
  event on a map → others discover. Positioned as a **personal utility** ("never forget a poster you
  walked past"), indie, subscription. [verify: platforms, price (~€2/mo?), traction] — treat as
  *validation that the mechanic works and people pay*, and its positioning gap (no crawl layer, no
  regional density, no family lens) as our opening. **Action: download, scan 5 real Linz posters,
  note where it annoys — free product research.**
- **EventMap** (generic name; several apps) — map-based public/private events with filters. [verify which]

---

## 6. So what — where the gap actually is

Every *individual* feature we have exists somewhere. What does **not** exist is a winner, and
specifically no one has combined all three of:

1. **Crawled supply** (Gemeinde / Familienkarte-class sources via LLM extraction) so the map is full
   *before* any user contributes — beats the cold-start trap;
2. **Scan-to-shared-map** as the crowdsourced layer on top — the un-aggregated long tail (posters);
3. **A high-constraint audience lens** (family filters, radius, weekend-first) in **one region until
   near-complete** — the "niche thyself" + density escape from the graveyard.

The right bar is **not** "nothing like this exists" (false) but **"nothing like this exists for
families in Oberösterreich with ~95% coverage"** (true, and a four-weekend project for one motivated
person, not a venture-scale problem). The category is won on **supply density in a bounded area**, not
on features — the graveyard is full of nice maps.

---

## 7. Open verification tasks

- [ ] Confirm LocalPosters specifics (platforms, price, traction, exact feature set) — hands-on.
- [ ] Confirm Familienkarte OÖ feature set, coverage, and partnership openness (design-doc §11.2).
- [ ] Confirm Rausgegangen / AllEvents coverage inside OÖ / Linz.
- [ ] Check current status of Partiful, Fever scale, and any *new* 2024–2026 AI-native event apps
      (the LLM-extraction wedge is recent enough that a fresh entrant is plausible — scan for it).
- [ ] Any DACH poster-scan or Gemeinde-aggregation startup specifically → highest-priority threat check.
