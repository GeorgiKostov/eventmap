# Bulgarian event sources — beyond the municipal crawl

Research pass, 2026-07-13. Question from George: we already crawl official municipal/tourism
sites (~1600 events for BG / okolo.events). What ADDITIONAL Bulgarian event data exists —
especially anything with **clean/structured/licensable** access, and especially **family/kids
events + evergreen family places**? Founder hunch: "lots of IT people in Bulgaria, maybe someone
built something" open-source.

Methodology: web search + primary-source fetch (GitHub REST API, portal pages, ToS/copyright
footers, dataset pages). Where a claim couldn't be verified against a primary source it's marked
**unverified** rather than stated as fact. No code/DB changes made. Mirrors the format of
[`open-event-sources.md`](open-event-sources.md) (the Austria pass).

**Verdict legend:** **ingest-now** (worth wiring up this cycle) · **register-sites** (not a feed,
but tells the crawler which sites to add — facts + linkback per CLAUDE.md) · **watch** (real but
revisit later / needs a BD conversation) · **avoid** (ToS-blocked, dead, no feed, or wrong shape).

---

## Headline answer

**No clean, open, licensed, event-granular BG feed exists** — the same conclusion as the Austria
pass, but BG is *worse*: Bulgaria has no Linztermine/ContentDB equivalent. The single genuinely
open, licensed dataset (Sofia's cultural-calendar on the national open-data portal, CC-BY) is a
once-a-year municipal **funding programme**, not a live "what's on this weekend" feed. The
founder's "someone built an open events project" hunch is **verified false**: exhaustive GitHub
search turned up exactly one relevant repo — a personal, unlicensed, single-file scraper of
*cinema* listings — and nothing maintained or reusable. So the strategy stays: **crawl facts +
linkback**, and the highest-value new targets are a handful of **structured family/kids listing
sites** that fill the exact gap the product cares about.

---

## 1. Open-source / community-built BG event projects

Searched the GitHub REST API across `bulgaria events`, `sofia events api`, `programata`,
`bulgaria opendata`, `afisha`, `eventim`, plus BG civic-tech orgs. Findings verified against repo
metadata and source files.

| Project | What it is | Access / shape | License | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|---|---|
| [`vasilvas99/programata-scraper`](https://github.com/vasilvas99/programata-scraper) | Personal Python scraper of **programata.bg cinema screenings** → MongoDB; clean pydantic models (Movie/Screening/venue/time), `cinemagoerng`+IMDb enrichment. Single `main.py`, 0★, last push 2025-09-28, **no LICENSE file** | Source code only; not a hosted dataset/API/feed | None declared (⇒ all-rights-reserved by default) | Movies only, no family/kids angle | **avoid** | Proof programata is scrapeable, but it's a narrow personal project, not a dataset we can ingest. |
| BG civic-tech orgs ([obshtestvo.bg](https://github.com/obshtestvo), [governmentbg](https://github.com/governmentbg), yurukov) | Real, active civic-tech scene (FOI tools, recycling maps, parliament trackers, opendata theme/portal code) | — | Mixed OSS | **No events project among them** | **avoid** | Verified: none of these publish an events calendar/dataset. |
| "OpenStreetEvents"-style BG project | — | — | — | Does not exist | **avoid** | No crowdsourced BG events DB with real 2026 coverage. |

**Bottom line:** the hunch doesn't pan out. There is no maintained open BG event dataset, API, or
iCal aggregator. The one artifact (a movie scraper) actually reinforces that anyone who wants BG
event data *scrapes for it themselves* — which is the crawl strategy.

---

## 2. opendata.government.bg / data.egov.bg (national open-data portal)

`opendata.government.bg` and `data.egov.bg` are the same national portal (custom platform
[`governmentbg/data-gov-bg`](https://github.com/governmentbg/data-gov-bg), portal code EUPL-licensed).
Dataset licensing is predominantly **CC-BY** (search result: ~1427 CC-BY datasets), the default
under Bulgaria's PSI/open-data rules — so a dataset found here is generally commercially reusable
with attribution.

- **One events dataset found:** *"Календар на културните събития на Столична община"* (Sofia
  Municipality Cultural Events Calendar) —
  [resourceView d89201ab…](https://data.egov.bg/data/resourceView/d89201ab-d8e4-49ee-a4cb-60258be685d3).
- **What it actually is (the catch):** a **funding-programme document**, not a consumer feed. It's
  the annual list of events Sofia Municipality co-funds (sections: "Strategic events", "Significant
  events", "Summer programme", district events…), approved yearly by City Council decision
  (2022/2023/2024/2025 versions exist, [kultura.sofia.bg/calendar](https://kultura.sofia.bg/calendar/)).
  Freshness = **annual**; granularity = programmatic (which festivals get money), not "this puppet
  show, Saturday 11:00, this venue." Useful to seed *major recurring festivals*, useless for the
  long tail.
- **Access friction:** the portal **WAF-blocks scripted access** — every `curl`/WebFetch attempt
  (frontend, `/api/3/action/*`, resourceView) returned **HTTP 403**. The portal *does* have a
  documented data API, but pulling this dataset in practice means a manual/browser download, not a
  cron job.

| Access / shape | License | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|
| Single dataset (CSV/XML resource); portal API exists but bot-gated (403) | **CC-BY** (portal default; not separately confirmed on this resource — treat as CC-BY, **unverified** at row level) | Sofia only; "family" only insofar as funded festivals include kids events | **watch** | Real + licensed but annual/programmatic; do a one-off manual pull to seed big recurring festivals, don't build a pipeline. |

No other events/cultural-calendar dataset surfaced on the portal.

---

## 3. Sofia municipality open data

- **No dedicated Sofia events *dataset* beyond the national-portal one above.** No separate
  `gis.sofia.bg` / Sofia open-data events layer found (**unverified that one exists** — searched,
  nothing surfaced).
- Sofia's events live as **HTML municipal calendars**: [kultura.sofia.bg/calendar](https://kultura.sofia.bg/calendar/),
  [visitsofia.bg](https://www.visitsofia.bg/) (its calendar uses `month.calendar/YYYY/MM/DD` URLs —
  the **JEvents/Joomla** pattern, which *can* expose an iCal export if the admin enabled it;
  **unverified** whether visitsofia did), and the [sofia.bg](https://www.sofia.bg/) portal events
  section.

| Access / shape | License / ToS | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|
| HTML calendars; visitsofia possibly iCal-exportable (JEvents), else clean crawlable | Municipal, no explicit open license on the HTML pages | Sofia; visitsofia has a "за децата и цялото семейство" section | **register-sites** | These are municipal — crawl facts + linkback; likely already partly in the 1600. Probe visitsofia for an `.ics` export before writing a bespoke scraper. |

---

## 4. bulgariatravel.org / Ministry of Tourism national portal

- **Rebranded:** `bulgariatravel.org` → **visitbulgaria.com** (official national tourism portal,
  domain change [announced May 2025](https://sofiaglobe.com/2025/05/18/bulgarias-national-tourism-portal-has-new-name-domain/)).
  `bulgariatravel.org` now 301-redirects there (verified via HTTP header). Ministry itself:
  [tourism.government.bg](https://www.tourism.government.bg/en).
- Has event/festival editorial content. **No documented open API or feed found** (**unverified** —
  no JSON/iCal/RSS surfaced; treat as HTML editorial only).

| Access / shape | License / ToS | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|
| HTML editorial listings, no confirmed feed | National tourism body; no open license published on listings | National, tourism-skewed (festivals/markets), thin on kids | **register-sites** | Crawlable facts + linkback like any municipal/tourism site; not a feed. Low family yield. |

---

## 5. programata.bg (Sofia/Plovdiv/Varna culture guide)

- **Coverage:** free bimonthly culture guide, **8 cities** — Sofia, Plovdiv, Varna, Burgas, Veliko
  Tarnovo, Gabrovo, Pleven, Ruse. Categories: cinema, theatre/stage, music, exhibitions,
  literature, city. **Has a dedicated "За деца" / Kids section** (verified on the homepage) — a
  genuine family angle.
- **Feed/API:** **none** — no RSS/iCal/JSON/API found (verified: not in the page; a third party had
  to *scrape* it — see §1).
- **ToS posture:** footer reads **"© 2002–2023 Програмата HiEnd Publishing. Всички права
  запазени"** (all rights reserved) — **reuse-hostile**. Our facts-only + linkback model is the
  mitigation (we index title/date/place and write our own copy), but this is a commercial publisher
  to tread carefully with, not a partner.

| Access / shape | License / ToS | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|
| HTML-crawlable, no feed | "All rights reserved" — no reuse grant | 8 cities; explicit Kids section | **register-sites** *(with ToS flag)* | Best editorial breadth outside municipal sites and has a kids vertical; crawl facts-only, linkback, never copy prose/images. Flag to George before making it load-bearing. |

---

## 6. grabo.bg

- Deals/experiences **voucher** platform (part of Netinfo / Nova Broadcasting group). "Events/
  experiences" are commerce SKUs (boat trips, dinners, spa) with validity windows, not dated
  cultural listings.
- **No public API / feed found** (**unverified** any developer access exists).

| Access / shape | License / ToS | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|
| Voucher commerce site, no feed | Commercial marketplace ToS | Some kids activities, but as vouchers not dated events | **avoid** | Wrong shape (commerce, not a "what's on" calendar); no feed. |

---

## 7. Family/kids-specific BG sources (the product's core)

This is where BG actually delivers value — **curated, structured, family-first listing sites** that
municipal crawls miss. Two are strong crawl targets.

| Source | What it is | Access / shape | License / ToS | Coverage incl. family | Verdict | Why |
|---|---|---|---|---|---|---|
| [**clubcheta.com/events-calendar**](https://clubcheta.com/events-calendar/) | Kids events calendar | **Well-structured HTML**: date+time, **age ranges** (0–1, 1–2, 3–5, 7+), venue, category (workshops, puppet theatre, concerts, sport, art). No feed/API. | **No visible copyright/ToS** in footer (contact email only) | **6 cities** (Sofia, Varna, Plovdiv, Burgas, Veliko Tarnovo, Stara Zagora); 100% family/kids | **register-sites** | Cleanest multi-city kids feed found; exactly the product's target content. Crawl facts + linkback. |
| [**sofia.plays.bg**](https://sofia.plays.bg/) ("София играе ООД") | Kids events **and** evergreen places directory | Structured HTML: dates, **age bands** (0–3, 3–7, 7–12), venues, categories, **map view**, free/paid flag, summer-camp lists. No feed/API. | "2026 © СОФИЯ ИГРАЕ ООД", "Общи условия" (all-rights-reserved posture) | Sofia only; 100% family/kids **+ evergreen places** (soft-play, museums, theatres) | **register-sites** | Also covers **evergreen family places**, not just dated events — fills the "where to take kids" layer. Sofia-only. Facts + linkback; ToS flag. |
| programata.bg "За деца" | Kids vertical of the culture guide (see §5) | HTML | All rights reserved | 8 cities, kids section | **register-sites** | Covered in §5. |
| Evergreen venues (Музейко / Muzeiko science centre, Fun City, VIDENIE KIDS, kids theatres) | Individual family venues | Own sites / listed on clubcheta & sofia.plays.bg | Per-venue | Evergreen "family places" | **register-sites** | Seed these as permanent POIs; discover them *via* clubcheta / sofia.plays.bg rather than one by one. |
| roditeli.bg, az-deteto.bg | Parents' portals (named in brief) | **Not verified** this pass — no primary fetch confirmed structured event listings | — | — | **watch** | **Unverified**; worth a 10-min manual look, but clubcheta + sofia.plays.bg already cover the kids-events need better. |

---

## 8. Ticketing (brief — expected partner-only/no API)

| Source | Access model | Republish/feed? | Coverage | Verdict | Why |
|---|---|---|---|---|---|
| **Eventim.bg** (CTS Eventim) | Market leader, ~75k events. **No public/self-serve API**; partner-gated "Affiliates Network" feed + EVENTIM.Tixx integration APIs for clients only. Unofficial reverse-engineered wrapper exists ([pyventim](https://kggx.github.io/pyventim/)) — ToS-risky, don't rely on it. | Partner-only | National, ticketed events | **avoid** | Confirms the expectation: no open API; scraping is ToS-hostile. |
| **bilet.bg** (Ticket dot BG) | Has **"Eventiplier"** — an *affiliate content* programme that hands partners a ready **event calendar + free content + deep links** (commission 1.5–5% via ProfitShare). | Partner content feed (not open) | National ticketed events | **watch** | The one BG channel offering *structured event content* for reuse — but it's a **BD/affiliate deal**, not an API. Flag to George if a partner route is wanted. |
| ticketstation.bg | Ticketing site | No API found (**unverified**) | National | **avoid** | No feed; ticketed slice is small vs families-first content. |

---

## Top 3 things to pursue next for Bulgaria

1. **Register the two family/kids listing sites as crawl sources — [clubcheta.com](https://clubcheta.com/events-calendar/)
   (6 cities) and [sofia.plays.bg](https://sofia.plays.bg/) (Sofia, + evergreen places).** Highest
   value, zero partnership needed: both are cleanly structured (dates, age bands, venue, category),
   both are 100% the families-first content the product exists for, and together they add the
   kids-events + evergreen-places layers the municipal crawl misses. Crawl facts + linkback; treat
   sofia.plays.bg's "all rights reserved" with the standard facts-only mitigation. Discover
   individual family venues (Muzeiko, kids theatres) *through* them.
2. **One-off manual pull of the national portal's Sofia cultural-calendar (CC-BY)** to seed the big
   recurring festivals — [resourceView d89201ab](https://data.egov.bg/data/resourceView/d89201ab-d8e4-49ee-a4cb-60258be685d3).
   It's the only genuinely open+licensed dataset, so use it, but only as a **festival seed list**
   (annual/programmatic granularity), and expect a browser/manual download because the portal
   403s bots. Cheap, no partnership.
3. **Register programata.bg (8-city culture guide, incl. a Kids section) as a crawl source, with a
   ToS flag to George.** Broadest editorial coverage outside municipal sites; facts-only + linkback
   keeps us clean against its "all rights reserved" footer, but confirm George is comfortable
   before it becomes load-bearing. Probe [visitsofia.bg](https://www.visitsofia.bg/) for a JEvents
   `.ics` export in the same pass (possible free structured feed).

**Watch/BD, not now:** bilet.bg's *Eventiplier* affiliate content programme is the only path to
*licensed structured* event content in BG — but it's a commission deal, not an API; raise only if
George wants a partner route. roditeli.bg / az-deteto.bg unverified — low priority given clubcheta
+ sofia.plays.bg already cover kids.

**Do not build against:** Eventim/ticketstation (no open API, ToS-hostile), grabo.bg (voucher
commerce, no feed), the "someone built an open BG events project" idea (verified: doesn't exist).

## Does a clean licensed feed actually exist? (the strategic question)

**Verified: essentially no.** The thesis holds. Bulgaria has exactly **one** open, licensed,
event-bearing dataset — Sofia's CC-BY cultural-calendar — and it's an annual municipal funding
programme, not a live consumer feed. There is **no** BG equivalent of Austria's Linztermine XML API
or Österreich Werbung ContentDB: no national tourism events API, no maintained community/open-source
aggregator, no municipal events API. Everything usable is **HTML to be crawled** (municipal sites,
programata, the family/kids sites) under a facts-only + linkback posture, plus one thin CC-BY
seed dataset and one affiliate content programme (bilet.bg) that would require a BD deal. The BG
picture is *more* crawl-dependent than Austria, and the crawl-first strategy is the right one.
