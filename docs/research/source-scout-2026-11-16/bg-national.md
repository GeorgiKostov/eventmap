# BG national / multi-city + next-tier source scout (2026-11-16)

Research only. About 3-6 requests per site, bot UA `OkoloBot/1.0`, no DB writes. All probed sites served UTF-8 (no Windows-1251 seen).
Conclusion on the earlier doc (`docs/research/bg-event-sources.md`): still true that no clean open national feed exists.
Two structural findings are new and more useful than any national feed:
(1) a shared municipal CMS (NK Software) used by at least 11 obshtini;
(2) several next-tier tourism/venue sites expose WordPress REST or `<time datetime>` markup that needs no LLM.

Verdicts: register-now / needs-adapter / ask-George / avoid. "Upcoming" = events with a date >= 2026-11-16 seen in the probe.

## (A) Multi-city / national platforms

| Platform | URL | Structured route (exact) | robots | Terms / copyright | Est. upcoming | Cities | Verdict |
|---|---|---|---|---|---|---|---|
| EventiBG.com | https://eventibg.com | Per-event pages carry full schema.org `Event` JSON-LD (startDate/endDate/geo/location/price/image). Discovery: day pages `https://eventibg.com/event/DD/MM/YYYY` (lists the day's events; 18 on 2026-12-12) or `/sitemap.xml` (2117 event URLs, but ~95% are past; sitemap `lastmod` is edit time, not event date). Also `/event/<slug>/ics`. Page sampling: 27 of 30 event pages had Event JSON-LD, but a few pages (e.g. koleden-bazar-2026-v-kostenets) have an empty ld+json block. | `User-agent: *` Allow /, Disallow /uploads/. No AI-bot rules. | `/terms`: user-submitted platform. Says it claims no ownership of images; no scraping ban or reuse licence stated. Our facts + linkback model fits; never copy the images (they are user-uploaded). | About 40-45 unique events over the next 60 days (sampled every 4th day: 42 unique). Seasonal low; summer peaks (about 450 events in May). | Nationwide, mostly villages and small towns (Sandanski, Smolyan, Shabla, Ahtopol, Troyan...). City index pages `/city/<slug>` cover about 184 places. | register-now via a listing-to-detail route: crawl the day pages (next 60 days), then read JSON-LD from each detail page. Needs the existing `twohop-events.js`/`jsonld-events.js` pattern. The registered rows are single event URLs and `/city/<x>` rows flagged `llm`, so they don't scale. |
| clubcheta.com | https://clubcheta.com/events-calendar/ | Listing has about 98 `/events/<slug>/` links. Each detail page has `Event` JSON-LD with a `subEvent[]` array (one entry per showtime, `startDate` with +02:00) plus `audience.suggestedMinAge`, `location.geo`, `duration`. `wp-json` does NOT expose the events post type, and there is no tribe route. | `Disallow:` empty (allow all). | No copyright/ToS seen. Kids-only. | In a 24-event sample, 6 future showtimes, so about 25-40 upcoming showtimes. | Sofia only in what the listing returned (the old doc said 6 cities; I only saw София). | needs-adapter: the JSON-LD route is in place, but `lib/jsonld-events.js` has no `subEvent` handling (only `wien-erleben-events.js` does). Registered as #2501 with `llm`, so it is dead now. Small fix, kids-first, high value. |
| visitbulgaria.com (official portal) | https://visitbulgaria.com | `wp-json/tribe/events/v1/events` works, plus `/events/?ical=1`. | `User-agent: *` and nothing else (allow all). | Official tourism portal. | 0. 102 events total, the newest 2025-10-10. Abandoned. | n/a | avoid (stale). Re-check in spring. |
| mc.government.bg (Ministry of Culture) | https://mc.government.bg | `wp-json/wp/v2/event` exists. | `Crawl-delay: 60`. | State site. | 1 event in total. | n/a | avoid (empty). |
| data.egov.bg open data | https://data.egov.bg | Not testable: HTTP 403 to every scripted request (page and `/api/listDatasets`). | n/a (WAF) | CC-BY by default. | The earlier doc found only Sofia's annual funding calendar. | Sofia | avoid for automation (WAF). Manual download only. |
| programata.bg | https://programata.bg/ (`/kids/` registered as #2740, off) | WP, but REST exposes only posts and pages. No event JSON-LD found on the home page. | Allow all except `/wp-admin/`. | "All rights reserved" (see old doc). | not measured | 8 cities | ask-George (reuse-hostile publisher); not structured, so it also needs an adapter. Low priority. |
| mainevent.bg | https://mainevent.bg | WP REST type `tc_events` (Tickera ticketing). | Allow all except cart/woocommerce paths. | Ticket seller, so it falls in the "ticketing reseller" avoid class. | not measured | national | avoid (reseller). Their events usually have an organiser or municipal page; use that instead. |
| bilet.bg | https://www.bilet.bg | none (SPA, no Event JSON-LD found) | robots lists AI bots (GPTBot etc.) and disallows `/api/`. | Commercial reseller. | n/a | national | avoid. |
| eventim.bg / kupibileti.bg | registered ids 1204/1156/2073/2075 | HTML / 403 | n/a | Reseller, ToS-hostile | n/a | n/a | avoid. Existing rows `works` with no feed kind should be reviewed for removal. |
| sofia.plays.bg / plovdiv, varna `.plays.bg` | https://sofia.plays.bg | No `Event` JSON-LD on the home page; the sibling subdomains don't resolve. | `User-agent: *` Allow / (cart/auth/api disallowed). | "All rights reserved" | not measured | Sofia only | Sofia agent's scope; not multi-city. |
| NAMRB / tourism ministry PDFs, bta.bg "Предстоящи събития", capital.bg calendars | various | No feed. Editorial and PDF lists. | n/a | Editorial copyright (BTA, Capital) | n/a | national | avoid (editorial, no reuse). |

Not found: no national kids aggregator with a feed, no читалища registry with events, no national museum network calendar, and no BG library network feed. The search tool returned nothing useful for these; direct probes of chitalishta.com, nationalmuseums.bg, bgtheatre.com, za-detsa.com and ticketportal.bg did not resolve or returned errors.

## (B) Shared municipal CMS: NK Software (the GEM2GO equivalent)

Footer string: "Уеб сайт и поддръжка: NK Software" (a Stara Zagora vendor). Confirmed on **Haskovo, Shumen, Pazardzhik, Pleven (www.pleven.bg), Veliko Tarnovo, Lovech, Dobrich, Sevlievo, Troyan, Dimitrovgrad**; `vratza.bg` has the same events path, so it is probably the same vendor. The vendor is the only tell; Smolyan, Asenovgrad, Burgas and Kyustendil returned 403 to my probe. They are not confirmed either way.

Common fingerprint: `<base href="https://<host>/">`, relative links `bg/sabitiya`, `bg/sabitiya/<slug>`, `bg/kultura`, `bg/obshtinski-fond-kultura`, `bg/kulturni-instituti`, sitemap at `bg/rss/sitemap`, news RSS at `bg/rss/news`, a homepage calendar widget linking `bg/posts/index/YYYY-MM-DD`, offset pagination `bg/sabitiya/page/<offset>` (offset steps of 12/18/36 per site), `robots.txt` blocks only `/admin/`, `/system/` and `/uploads/*.pdf|doc|xls|...`, and server-rendered HTML.

Event markup differs per site template. Cheap, deterministic parsing is available on every site I looked at, with no LLM:

| Site | Events URL | Date markup | Sort | Upcoming seen | robots |
|---|---|---|---|---|---|
| Haskovo | https://www.haskovo.bg/bg/sabitiya | `<time class="mr-3">14 Ноември 2026 - 14 Ноември 2026</time>` (event date range, Bulgarian month names) + `<h2 class="title"><a href="bg/sabitiya/<slug>">`; teaser text has time and venue | newest event date first | 11 of 12 on page 1; the day index `bg/posts/index/2026-11-21` also works | no AI rules, no crawl-delay |
| Veliko Tarnovo | https://www.veliko-tarnovo.bg/bg/sabitiya | `<time datetime="2026-10-17 19:00:00">` plus an end time (machine readable) | descending | 0. The newest item in 54 sampled is 2026-10-17, so the municipality stopped posting here. Their real calendar is `bg/kulturen-kalendar`. | `Crawl-delay: 10`, Allow / |
| Shumen | https://www.shumen.bg/bg/sabitiya | `<time datetime="2017-06-01 09:00:00">` | ASCENDING from 2017; the last offset page (`/page/4338`) is the newest and had 2026-11-28 to 2026-12-06 items | exists, but only on the last page | no robots.txt (404) |
| Pazardzhik | https://pazardzhik.bg/bg/sabitiya | `<time datetime>` is the post date, not the event date | by post date | latest post 2026-10-28; event dates sit in the text | `/uploads/` disallowed |
| Pleven | https://www.pleven.bg/bg/sabitiya | `<time datetime>` is the post date; the page 1 items are from 2023 | stale | 0 | Cloudflare: `Content-Signal: search=yes,ai-train=no` and explicit Disallow for ClaudeBot, CCBot etc. (registered as `ai_bot_policy`). We are not an AI trainer, but this is a policy flag: ask-George. |
| Lovech / Sevlievo / Troyan / Dimitrovgrad / Dobrich | `/bg/sabitiya` (Dobrich returned 404) | not measured; they looked nearly empty (Lovech 1 item, Sevlievo 0) | | low | allow all except `/admin/` |

Verdict for the CMS family: **needs-adapter, a single `nksoftware-events.js`** (list page -> `article` -> `<time>` -> detail link), with a per-site config: which `<time>` is the event date, sort direction, and whether to jump to the last offset page. Realistic yield is not large: Haskovo is the only strong site (about 12-20 upcoming). Shumen is potentially good once the pagination is handled. Treat the family as roughly 30-60 events total for about 11 towns, not hundreds. Haskovo and Shumen are the two worth doing first.

## (C) Next-tier cities

Registered rows come from `sources-BG.tsv` (all `llm` unless noted, so none of them yields events today).

| City | Source | URL | Deterministic route found | robots / terms | Est. upcoming | Verdict |
|---|---|---|---|---|---|---|
| Ruse | ruseonthedanube.com (registered #1171 `jsonld`, `ai_bot_policy`) | https://ruseonthedanube.com | Tribe REST: `/wp-json/tribe/events/v1/events?per_page=50&start_date=2026-11-16`, `total` 104 upcoming. Venue city is present on some rows. | Cloudflare `Content-Signal: search=yes,ai-train=no,use=reference`, ClaudeBot/CCBot disallowed (we are not those). Independent project, not municipal. | 104 | ask-George: the best single Ruse source by far, but it is not municipal (CLAUDE.md rule 1) and has an AI-training signal. If approved it is register-now, since a tribe adapter is simple (`lib/cms-fingerprint.js` already mentions tribe). |
| Ruse | visitruse.bg/events (#1076) | https://visitruse.bg/events | Server-rendered; 83 `<time datetime="YYYY-MM-DD">` blocks with day, month, `HH:MM`, venue (`div.place`) and title (`h6.title`), and Google-Calendar links with full start/end. Page spans 2026-10-01 to 2026-11-30. | `Disallow: /config/, /files/` only | 31 on or after 2026-11-16 | needs-adapter (about 30 lines of cheerio). Official city tourism site. Good. |
| Ruse | obshtinaruse.bg/kulturen-afish (#1073) | https://obshtinaruse.bg/kulturen-afish | Supports a date filter: `?date=01.01.2026&date_to=31.12.2026`. Item markup not inspected. | allow all | unknown | needs-adapter (inspect markup); lower priority than visitruse.bg |
| Gabrovo | dkem.bg (#2040) | https://dkem.bg/sybitiya/ | `wp-json/wp/v2/event?per_page=100&_fields=id,link,acf`; ACF gives `date_and_time` ("2026-12-10 19:00:00"), `event_venue`, `event_category`, `free`, `pricing`, `parental_control`. | allow all except wp-admin | 7 (of the 100 newest; 128 total) | register-now (clean JSON, Vienna-style wall-clock). Needs a tiny REST adapter; also fits a generic "WP REST + ACF" adapter. Warning: `event_short_description` is prose, so do not store it (write our own). |
| Gabrovo | visit.gabrovo.bg (#2035) | https://visit.gabrovo.bg/sabitia/ | WP REST type `event` (87 total) but dates are not in REST (empty ACF). The HTML page has a day-by-day list with ISO anchors `#event-day-2026-11-16` and "16 ноември 2026, 19:00" text. | allow all | many (162 date strings on the page) | needs-adapter (HTML day blocks). Medium effort. |
| Gabrovo | gabrovo.bg/bg/calendar (#2041) | https://gabrovo.bg/bg/calendar | FullCalendar 5.11 (JS), probably fed by a JSON endpoint. Not found in static HTML. | allow all | unknown | needs-adapter (find the FullCalendar `events` URL in the page JS; a browser network trace is quicker than guessing). |
| Veliko Tarnovo | velikoturnovo.info (#1205) | https://velikoturnovo.info/events | WP REST `events` (170 total, `events_category`), dates only in the HTML content, Yoast metadata. | `Disallow:` empty | unknown | needs-adapter (dates inside the content text). Medium. |
| Veliko Tarnovo | veliko-tarnovo.bg (#1201) | https://www.veliko-tarnovo.bg/bg/kulturen-kalendar | NK Software CMS (see B). `bg/sabitiya` is stale since 2026-10-17. | Crawl-delay 10 | 0 on `bg/sabitiya`; `kulturen-kalendar` not inspected | needs-adapter (NK) |
| Haskovo | haskovo.bg (#2043) | https://www.haskovo.bg/bg/sabitiya | NK Software, clean event date range (see B) | allow all | about 12-20 | needs-adapter (NK), best NK site |
| Stara Zagora | iyc.starazagora.bg (#1192) | https://iyc.starazagora.bg/sabitiya | `article.event-card` list, RSS at `/rss_feed/view/1`, pagination `/sabitiya/p2`. Youth centre, not citywide. | allow all | cards present; many marked `event-card--inactive` (past) | needs-adapter. Small, youth-focused. |
| Stara Zagora | starazagora.bg (#1147) | https://www.starazagora.bg | HTTP 403 to my probe (bot block). The registered `kulturen-afish` news URL is an editorial post. | blocked | n/a | ask-George / skip. A browser-based check is needed to see if it is really blocked or just UA-sensitive. |
| Stara Zagora | operasz.bg (#1087) | https://operasz.bg | JS challenge (`/__superjs/challenge`) | n/a | n/a | avoid (challenge page = bot gate) |
| Sliven | mun.sliven.bg (#1151, off) | https://mun.sliven.bg/kalendari-afishi | The "Културен афиш за месец ноември 2026" is an uploaded document (monthly PDF) published on a page. | n/a | one monthly PDF | ask-George (PDF only, no per-event feed). Note the domain changed from www.sliven.bg to mun.sliven.bg, so the registered URL is stale. Fix the URL at least. |
| Shumen | shumen.bg (#1150, off) | https://www.shumen.bg/bg/sabitiya | NK Software; ascending order, last offset page has the newest | no robots.txt | exists | needs-adapter (NK) |
| Pleven | visitpleven.com/events (#1158, off) | https://visitpleven.com/events/ | WP, but REST exposes only posts/pages; event detail pages at `/events/<slug>/`. Dates not found in the listing HTML by regex. | allow all | unknown | needs-adapter (inspect the cards). |
| Pleven | spiritofpleven.com (#1155) | https://spiritofpleven.com/category/kulturen-afish/ | WP category posts | disallows AI bots (37 lines) | unknown | avoid (policy). |
| Pleven | pleven.bg (#1148/#1154/#1081) | https://www.pleven.bg | NK Software, stale list | `ai_bot_policy` | 0 | ask-George (policy flag) |
| Pazardzhik | pazardzhik.bg (#2071) | https://pazardzhik.bg/bg/sabitiya | NK Software; list shows post date; also `bg/kulturen-afish/kulturen-afish` | `/uploads/` disallowed | unknown | needs-adapter (NK, event date in text) |
| Blagoevgrad | blagoevgrad.bg (#1072/#1099/#1144) | https://www.blagoevgrad.bg | Next.js app (server header `Next.js`); no event feed found on the home page. | allow all | unknown | needs-adapter (probably a JSON API behind the SPA; needs a network trace). |
| Rest | theatres: puppetruse.com, ruseopera.com, stageoftheages.bg, theatrepazardzhik.com, pzdnes.com | each | WP sites (puppetruse has 4 AI-bot disallow lines); `dramagabrovo.com` is already registered `jsonld` | mixed | small | low priority |

## Top 5 by events per effort

1. **ruseonthedanube.com (tribe REST, 104 upcoming for Ruse).** Almost no effort once a generic tribe adapter exists, but it needs George's decision (not municipal; `ai-train=no` signal; ClaudeBot disallowed).
2. **EventiBG.com day pages + JSON-LD detail (about 40-45 upcoming, nationwide, 184 places).** A two-hop crawl with the existing JSON-LD parser. The only multi-city source that reaches small towns; terms are permissive for facts.
3. **visitruse.bg/events (31 upcoming, official Ruse tourism).** Static HTML with `<time datetime>`, venue and title. About 30 lines.
4. **clubcheta.com (kids, about 25-40 showtimes, Sofia).** Event JSON-LD exists; only `subEvent[]` support needs adding to `lib/jsonld-events.js`. Highest family fit. (Sofia agent may overlap.)
5. **NK Software adapter, Haskovo first, then Shumen (about 12-20 each now; family of 11 towns).** One adapter, per-site config. Moderate effort (list parsing, month names, sort direction), and Haskovo and Shumen are the only two with usable current data.

Honorable mention: dkem.bg (Gabrovo, clean ACF JSON, only 7 upcoming) is a 15-minute adapter but small.

## Caveats

- Upcoming counts are sample-based estimates (EventiBG: 15 day pages; clubcheta: 24 of 98 events; NK sites: first listing page only).
- I did not verify any robots.txt against our actual crawler UA string, only for generic and AI-bot rules.
- Cloudflare `Content-Signal` lines (ruseonthedanube.com, pleven.bg) say `ai-train=no`; these are not robots Disallow rules for us, but flag them to George per CLAUDE.md rule 9.
- Per hard rule 7, anything registered must be repeatable by `scripts/crawl.mjs`. Every source above marked needs-adapter has a deterministic route and fits that rule; none relies on a one-off script.
