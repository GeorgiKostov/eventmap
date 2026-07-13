# Open / public event sources — should we ingest instead of crawling?

Research pass, 2026-07-12. Question from George: are there public/open event databases,
libraries, or feeds we should ingest instead of / in addition to crawling ~272 municipal sites?

Methodology: web search + primary-source fetch (data.gv.at catalog pages, CKAN/API docs,
vendor ToS pages) for each candidate. Where a claim couldn't be verified against a primary
source, it's marked **unverified** below rather than stated as fact. No code/DB changes made.

Legend for verdict column: **ingest-now** (worth wiring up this cycle) · **register-sites-only**
(not a feed, but tells us which sites to add to the crawler) · **watch** (revisit later, not
worth effort now) · **avoid** (ToS-blocked, dead, or wrong shape for us).

---

## 1. Austrian open government data (event-level)

All Austrian OGD (data.gv.at and its municipal/state members) publishes under one uniform
license as of March 2019: **Creative Commons Attribution 4.0 (CC BY 4.0)** — commercial use and
derivatives explicitly allowed, attribution required. This is confirmed project-wide
([data.gv.at Netiquette / OGD Austria Kooperation resolution](https://www.data.gv.at/infos/netiquette/)),
not just per-dataset, so every entry below inherits it unless noted.

| Source | URL | Format | License | AT/Linz coverage | Freshness | Verdict |
|---|---|---|---|---|---|---|
| **Linztermine / LiVe** (Stadt Linz official event calendar, open-data-listed) | [data.gv.at dataset](https://www.data.gv.at/katalog/dataset/dfa2ff35-d2c4-4196-9989-a1bdbeabbfed), catalog entry documents an `eventExport` **XML API** for linztermine.at (`event` nodes with `id`, `firstdate`, `lastdate`, `properforchildren`, `freeofcharge`; child elements `title`, `description`, `location`, `date`, `tag`, `organizer`, `links`; filterable by location/tag/organizer/date-range) | XML, event-granular, live API (not a static dump) | CC BY 4.0 | Linz, exact city we need | Live/on-demand (it's an API, not a periodic extract) | **ingest-now** — but the concrete endpoint (`export_info.php` on linztermine.at returned HTTP 403, i.e. exists but gated) needs Stadt Linz to grant access. This directly replaces our current HTML scrape of the monthly `/linz-erleben/` pages, which `briefs/mining-brief.md` already flags as flaky ("next month may 404 until published"). **Action: email Stadt Linz digital office / data.gv.at dataset maintainer requesting API access — same ask as the Familienkarte partnership outreach, bundle them.** |
| **Veranstaltungen Wien** | [data.gv.at dataset](https://www.data.gv.at/katalog/dataset/b01585af-110f-4f87-9bf1-06805605926c) | CSV/JSON per OGD Austria standard formats (exact resource URL not confirmed — catalog page is a JS-rendered SPA that resisted scripted fetch) | CC BY 4.0 | Vienna only | Unconfirmed, but Wien's OGD portal is actively maintained | **watch** — out of scope while Linz-first, but real and cheap to revisit once/if we expand to Vienna. Worth a 10-minute manual browser check before then to confirm resource format. |
| **Kulturserver Graz ("heute")** | [data.gv.at dataset: stadt-graz_kulturserver-graz-heute](https://www.data.gv.at/katalog/dataset/stadt-graz_kulturserver-graz-heute) | RSS (per dataset name), event categories: Music, Theater, Exhibition, Guided Tours, Children/Youth, Cabaret, Lectures, Film | CC BY 4.0 | Graz only | Unconfirmed cadence, RSS implies daily/live | **watch** — same reasoning as Vienna; Graz out of scope now but a clean RSS feed with a Children/Youth category is a good fit for our families-first angle later. |
| **Land Oberösterreich open data portal** | [land-oberoesterreich.gv.at/opendata.htm](https://www.land-oberoesterreich.gv.at/opendata.htm), REST/OpenAPI metadata contract via [e-gov.ooe.gv.at](https://e-gov.ooe.gv.at/at.gv.ooe.ogd2-citi/) | N/A | CC BY 4.0 (OGD Austria standard) | OÖ statewide | N/A | **avoid (no dataset found)** — searched the portal and found no dedicated Veranstaltungen/events dataset. The Land's `/veranstaltungen.htm` page is its own editorial listing, not an open feed. Don't spend more time here; the real OÖ-level event feed is the next row. |
| **Österreich Werbung ContentDB (LTO data interface)** — aggregates all Landestourismusorganisationen incl. **Oberösterreich Tourismus**, so this *is* the practical OÖ-and-national event feed | Open-data JSON extracts under CC-BY, plus a full [ContentDB API](https://contentdb.austria.info/docs/api) (JSON-LD, paged, filterable by classification) reachable at `oew.tourdata.at` endpoints; API access requires emailing **api@austria.info** | JSON / JSON-LD | **CC BY 4.0** for the open-data tier (explicit: "CC-BY-4.0: Österreich Werbung", commercial use + derivatives allowed with attribution); API-tier licensing terms not separately published — assume same unless ÖW says otherwise when you apply | All of Austria incl. Linz/OÖ (tourism-oriented, so skews toward markets/festivals/cultural events over small Gemeinde-level listings) | Open-data tier: **weekly**. API tier: not confirmed, likely near-live. | **ingest-now (apply for key)** — broadest single feed found in this research, official license terms already public, and it's tourism-board data so it's naturally family/visitor-relevant. Register for `api@austria.info` access in parallel with the Stadt Linz ask above. |

**Bottom line for this category:** two concrete, licensed, event-granular candidates worth
pursuing this cycle — Linztermine's XML API (hyper-relevant, needs an email) and the Österreich
Werbung ContentDB (broad, needs an email). Vienna/Graz open feeds are real but correctly out of
scope under Linz-first. Land OÖ itself has no events dataset — a genuine gap, not a research miss.

---

## 2. Open / collaborative event platforms

| Source | URL | Format | License/terms | AT coverage | Verdict |
|---|---|---|---|---|---|
| **OpenAgenda** | [openagenda.com](https://openagenda.com/) | Public agendas + [Opendatasoft mirror](https://public.opendatasoft.com/explore/dataset/evenements-publics-openagenda/) | Open data calendar model, per-agenda terms | **Checked directly** via their agenda search: exactly **one** Austria-tagged agenda found ("Europäische Archäologietage - Austria", ~7 events, archaeology-days niche). Nothing for Linz/Vienna/Graz. | **avoid** — negligible real coverage, French-market platform, not worth integrating for Austria today. |
| **Mobilizon** (ActivityPub event federation, Framasoft) | [mobilizon.org](https://mobilizon.org/), instance directory at [instances.joinmobilizon.org](https://instances.joinmobilizon.org) | ActivityPub, iCal export per instance | Instance-dependent, generally activist/community-run | **Unverified / inconclusive** — could not get a scriptable read of the instance directory (JS-rendered) or confirm a specific Austrian public instance in this pass. Known DACH activity skews German activist/community groups, not Austria-specific at meaningful volume. | **watch** — worth one manual browser check of instances.joinmobilizon.org filtered to Austria before fully writing it off, but don't block on it; low expected yield. |
| **radar.squat.net** | [radar.squat.net](https://radar.squat.net/en) | Per-group iCalendar feeds (`/ical/node/<id>`), plus schema.org/RDFa on pages; [API docs page](https://radar.squat.net/en/api) exists but was bot-walled (Anubis anti-scraping challenge) when fetched | Not fully confirmed (page inaccessible to automated fetch) | Confirmed Austria + Wien city filters exist in their URL structure, meaning some AT coverage exists | **avoid for our audience** — this is explicitly an "alternative and radical events agenda" (squats, activist spaces). Wrong content category for a families-first map even where it has AT listings; also anti-bot-gated. Not worth the legal/reputational mismatch. |
| **Wikidata** (recurring festivals via SPARQL) | [query.wikidata.org](https://query.wikidata.org/) | SPARQL endpoint, CC0 | Wikidata has properties for periodic recurrence (P837) that can model yearly festivals, and Austria-tagged festival/event items exist | Coverage is whatever volunteers have entered — good for **known, notable recurring festivals** (e.g. Ars Electronica, Brucknerfest), useless for the long tail of neighborhood/Gemeinde events that make up most of our density | **register-sites-only** — not a live feed to ingest, but a good one-off SPARQL pull to (a) seed/verify our list of major recurring Linz-region festivals and (b) find each festival's official site to register as a proper crawl source. |
| **OpenEventDatabase** | [openeventdatabase.github.io](https://openeventdatabase.github.io/), API at `api.openeventdatabase.org` | REST API, Python/PostgreSQL backend, French association since 2016 | Not specified/found | Its own docs describe scope as culture, sports, **transport, environment** — weather forecasts, traffic incidents, accidents alongside "spectacles/activités". No Austria-specific coverage claim found; the project reads as small/France-centric with sparse general population. | **avoid** — technically alive (API responds), but this is not "OpenStreetMap for events" at any real scale; it's a niche French civic-data project mixing disaster/traffic data with occasional cultural listings. Confirms the intuition in George's question: no OpenStreetEvents-equivalent exists with real 2026 coverage. |

---

## 3. Semi-open commercial APIs — terms check

| Source | Access model | Republish-with-linkback allowed? | AT/Linz coverage | Verdict |
|---|---|---|---|---|
| **Eventbrite API** | Self-serve key for your own app; [API Terms of Use](https://www.eventbrite.com/help/en-us/articles/833731/eventbrite-api-terms-of-use/) | Standard terms grant use *within your own application for your own integration* — **retrieving public events on behalf of many creators for redistribution explicitly requires their Distribution Partner Program**, a separate approval Eventbrite grants selectively. | Present in Austria but not verified how deep for family/community events | **watch / avoid-for-now** — not ToS-forbidden outright, but redistribution at map scale needs a partner application, which is a business-development ask, not a quick integration. Flag to George if he wants to pursue partner status; don't build against it speculatively. |
| **Meetup API** | Open REST API is retired; current access is a **GraphQL API gated behind Meetup Pro subscription + OAuth app approval** — no self-serve free tier for reading public groups at scale | Governed by Meetup's API License Terms; Meetup can revoke at will | Adult hobbyist/professional meetup skew, not the families-first category we need | **avoid** — cost (Pro subscription) and approval friction aren't justified by content fit; Meetup's category mix doesn't match our audience anyway. |
| **Bandsintown API** | Requires a Bandsintown-issued app ID **tied to a specific artist**, with written consent from Bandsintown; explicitly not for arbitrary third-party redistribution | Not designed for aggregator use — it's an artist-embeds-their-own-tour-dates product | Concerts only, and Austria coverage would just mirror what's already on venue sites we can crawl directly | **avoid** — wrong product shape for us; a concert crawled from the venue's own site achieves the same result without a gated per-artist key. |
| **Ticketmaster Discovery API / International Discovery API (covers Austria)** | International Discovery API (the one covering AT/DE/CH etc.) — **"no longer accepting new API key requests"** per their own developer docs as of this check; the newer Discovery API is being pushed for new integrations but its Austria/oeticket.com coverage wasn't confirmed | Terms include licensed-use restrictions not fully reviewed | Ticketmaster's own docs list Austria under the (closed) International API | **avoid, why: intake closed** — even if we wanted it, they're not issuing new keys for the API variant that covers Austria right now. Re-check in 6-12 months or if George wants to formally inquire with Ticketmaster/oeticket directly (paid ticketed events are also a smaller slice of our families-first content anyway). |
| **Facebook/Meta events** | Scraping explicitly prohibited under Meta's Automated Data Collection Terms; a 2024 US court ruling narrowed this to *logged-in* scraping, but Meta still actively enforces via bans/C&D/lawsuits | No — confirmed off-limits as CLAUDE.md/George's assumption expected | N/A | **avoid, confirmed** — matches the standing assumption; don't build anything that touches Facebook events, logged-in or not. |

---

## 4. Common Crawl as a discovery shortcut

- **Web Data Commons** (University of Mannheim) already runs the extraction we'd want to build:
  it pulls Schema.org JSON-LD/Microdata/RDFa out of every Common Crawl snapshot and publishes
  class-specific subsets (their Event-class subset would be the relevant one) —
  [webdatacommons.org/structureddata/schemaorg](https://webdatacommons.org/structureddata/schemaorg/).
  As of their 2022 report, ~38% of domains in Common Crawl carry some schema.org markup, up from
  ~3% in 2013, so JSON-LD adoption is real and growing.
- **Freshness is the disqualifier for live use.** Common Crawl runs a new snapshot roughly every
  1-2 months, with **weeks-to-months lag** between a page changing and it showing up in a crawl,
  and downstream WDC extracts add further processing lag on top. For a map whose value is "what's
  happening this weekend," data that's 6-10 weeks stale is close to useless for the events
  themselves.
- **.at-specific coverage figures weren't available** in this pass (Common Crawl publishes
  domain-level stats but not a clean TLD breakdown we could pull without downloading index
  shards — out of scope for a research-only pass).
- **Verdict: register-sites-only.** Don't use it as a data source. Use it (or a targeted WDC
  Event-subset pull) as a **one-off discovery sweep**: query the WDC schema.org Event dataset (or
  Common Crawl's columnar index) for `.at` domains emitting `Event` JSON-LD that we don't already
  crawl, then hand that list to the developer agent to register as new sources with our existing
  JSON-LD parser (which the pipeline already has per CLAUDE.md). This is genuinely useful as a
  **source-discovery** tool, worthless as a **live-data** tool.

---

## 5. "OpenStreetEvents" — does an open collaborative event database exist?

No. OpenEventDatabase (checked above) is the closest match by name and it's a small,
France-centric civic-data project mixing weather/traffic/disaster events with occasional cultural
listings — not a general-purpose, crowdsourced events database with real 2026 coverage anywhere,
let alone Austria. There is no OSM-equivalent for events. This confirms the premise in George's
question rather than surfacing a hidden option: **event data stays fragmented across each
publisher's own site, which is exactly why the crawl strategy exists.**

---

## Ranked shortlist of next actions

1. **Email Stadt Linz / linztermine.at for API access** (references the `eventExport` XML
   interface documented in the data.gv.at Linztermine dataset). Highest value: it's our #1 city,
   CC-BY-4.0 licensed, event-granular, and would replace a scrape that's already known to be
   flaky (monthly pages 404ing until published). Bundle with the existing Familienkarte
   partnership outreach — same "we're a municipal data reuser" pitch.
2. **Email api@austria.info for ContentDB/LTO API access.** Broadest licensed feed found,
   explicitly covers Oberösterreich, CC-BY-4.0 confirmed for the open-data tier. Worth applying
   even before we know the exact API-tier terms, since the fallback (weekly open-data JSON
   extracts) is already usable and licensed.
3. **One-off SPARQL pull from Wikidata** for known recurring Linz-region festivals, to sanity-check
   our existing source list and surface any official festival sites we haven't registered yet.
   Cheap, no partnership needed.
4. **One-off Web Data Commons Event-subset query for `.at` domains** to discover sites emitting
   Event JSON-LD that aren't in our 272 sources yet. Treat purely as a source-discovery task, not
   a data pipeline.
5. **Do not build integrations for:** Facebook (ToS-forbidden, confirmed), Meetup (paywalled,
   wrong content fit), Bandsintown (wrong product shape), Ticketmaster International API (not
   accepting new keys), OpenAgenda (negligible AT coverage), radar.squat.net (wrong content
   category for families), OpenEventDatabase (too small/off-topic).
6. **Revisit later, not now:** Vienna and Graz open-data event feeds (CC-BY-4.0, real, but out of
   scope under Linz-first — worth 10 minutes each when/if George green-lights expansion) and
   Eventbrite's Distribution Partner Program (a BD conversation, not an engineering task).

## Bottom line

None of this replaces crawling — most Gemeinde/parish-newsletter-level events (the long tail that
makes the map dense) simply have no open feed and never will; RiS-Kommunal/GEM2GO scraping stays
the backbone. But two genuine, licensed, event-granular feeds surfaced that are worth pursuing in
parallel with crawling: **Linztermine's XML export** (exact-city fit) and the **Österreich
Werbung ContentDB/LTO feed** (broad OÖ/national fit, CC-BY-4.0 confirmed). Both require an email
to a human, not just an API key click-through — treat them as partnership asks, not engineering
sprints, and route through George per the CLAUDE.md rule that data-partnership decisions are his
call. Common Crawl/Web Data Commons is worth a single discovery sweep to find under-the-radar
JSON-LD sites to register, but is fundamentally unusable as a live source given weeks-to-months
lag. Everything else checked (Facebook, Meetup, Bandsintown, Ticketmaster, OpenAgenda,
radar.squat.net, OpenEventDatabase) is either ToS-blocked, functionally closed, wrong content
fit, or too small to matter — confirming rather than contradicting the current crawl-first
strategy.

## Legal posture — Facebook link unfurling (2026-07-13)

We do **not** crawl or scrape Facebook. What we do: when a **user pastes a single public FB event
link**, `extract-url` fetches that one URL as the `facebookexternalhit` link-preview crawler, reads
the OpenGraph metadata FB deliberately exposes for previews, extracts the facts (title/date/place),
writes our own description, and stores the FB permalink as `source_url`. Mechanically this is
identical to what Slack, Signal, iMessage, and Twitter do when you paste a link — **link unfurling,
user-initiated, one event at a time, rate-limited.** That is the framing we stand behind, in UX and
internally.

- **Copyright / EU database right:** clean and unchanged — facts only, own prose, linkback. No FB
  content stored.
- **ToS / access:** a genuine gray area (UA identification as FB's crawler; content sits behind a
  UA-gated login wall). The unfurl framing is the mitigation; low volume and per-link user intent
  keep it far from "automated data collection." Worth a short lawyer check on the login-wall/UA
  point before FB is treated as a load-bearing coverage channel for the validation test.
- **Hard line — do NOT cross:** no logged-in FB account automation, no computer-use/browser-agent
  bot clicking through FB to harvest event links in bulk, no headless session farming. That would
  convert a defensible link-unfurler into automated logged-in scraping against Meta's terms —
  exactly the posture we've spent this project avoiding — and also violates the LLM providers' own
  usage policies (both OpenAI and Anthropic prohibit using computer-use to breach a target site's
  ToS or automate deceptive account activity). Growth of the FB channel comes from **users and
  organizers submitting links**, not from us operating a bot. See memory `bg-facebook-events`.
