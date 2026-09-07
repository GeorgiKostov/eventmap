# Okolo: readiness, partnerships and first revenue

Review date: **5 September 2026**. Repository: `843469d`, equal to `origin/main` after fetch. Author: Codex architect review, with specialized technical, metrics and partnership research. **Recommendations for George to decide; not an approved change of phase, price list or customer commitment.**

## 1. Decision

**Okolo has enough product to start selling a narrowly scoped managed programme-map pilot. It does not yet have evidence for selling audience reach or promising platform-scale reliability.** Close the privacy, dependency and delivery-readiness gaps before launching a paid customer programme. Start customer discovery immediately alongside that work.

The recommended next stage is a **managed commercial validation pilot alongside the four-weekend Linz family test**. The two tests answer different questions:

- Will an organizer pay for a useful map of its programme, distributed through its own channels?
- Will families repeatedly use Okolo because its regional coverage and curation are better for their needs?

A successful service pilot does not establish consumer product-market fit. A growing newsletter does not establish that organizers will pay. Measure both separately and connect them through approved programme supply and voluntary family subscriptions.

The strongest value proposition today is: **we take your existing programme, make a reliable mobile map, host it, keep it updated to an agreed schedule, and report actual use.** Basic factual indexing can remain free. Charge for delivery and ongoing responsibility.

## 2. Evidence and limits

The review inspected repository instructions, design, growth and partnership plans, routes, analytics, datastore, crawl/delivery workflows and the actual public partner/demo/event journey. It used read-only production aggregate queries at approximately **15:25 Europe/Vienna** and current official web sources. No source mining, production load test, registration, outreach, customer commitment, deployment or application/database mutation was performed.

| Area | Verified state | What it establishes |
|---|---|---|
| Product | Map, discovery/event pages, source links, accounts and saved events, authenticated contributions, poster extraction, newsletters, admin and partner showcase exist | Substantial working product, beyond a basic demo |
| Partner demo | Public map rendered tiles and pins; Saturday filter changed six sample entries to three; no warnings/errors in the checked flow | Credible demonstration, not a commissioned deployment or capacity proof |
| Tests | **351 passed, 0 failed**, running `node --test test/*.test.mjs test/*.test.js` | Current regression suite passes; many cases are source-contract checks rather than end-to-end execution |
| Build | September 4 repository records report passing production/local builds | Historical release evidence; **no fresh build in this review** because production-connected helpers can execute expiry writes |
| Dependencies | `npm audit --omit=dev`: **11 affected packages, 6 high / 5 moderate**; locked Next **15.5.20** | Remediation/triage required; not proof of 11 exploitable application vulnerabilities |
| Newsletter | **1 confirmed active recurring subscriber, Linz**; other four live editions have zero assigned rows | Delivery infrastructure is much further developed than its audience |
| Other consent records | 1 confirmed active Austrian launch-waitlist entry; 5 pending Linz subscriptions | Waitlist and pending entries are not newsletter reach |
| Actual send | September 3 workflow: sent 1, audience 1 | Real send path exercised; no meaningful reach claim |
| Reach/retention/revenue | Live PostHog retrieval unavailable; Search Console and commercial accounting not inspected | Visitors and revenue are **unknown**, not zero; no verified paid customer evidence was found in the reviewed tracker |

The five Austrian editions were explicitly approved on September 4. Their existence is not unauthorized drift; however, the remaining four currently have no subscriber base. Keep their approved operation, concentrate manual acquisition and quality work in Linz, and avoid adding further geography until results justify it.

### Supply: volume is real, useful family coverage remains unproven

The public Linz weekend page displayed **182 results for September 5–6 within 40 km**, with eight city-proper entries shown and a longer surrounding-area list. A separate diagnostic query over raw published rows overlapping the same dates/radius returned **343 occurrences**. These denominators differ: the public path applies additional ongoing-duration, report, bounding-box and series-deduplication rules. Raw overlap includes today's rows, not just future starts after the audit time.

| Raw Linz overlap diagnostic | Count |
|---|---:|
| Event rows / distinct lowercased titles | 343 / 220 |
| Venue/address precision | 123 (35.9%) |
| Date-only start, time unknown | 232 (67.6%) |
| Explicit family category | 22 |
| Explicit family plus precise location | 10 |
| Known age bounds | 3 |
| Known indoor/outdoor | 11 |
| Known free/paid | 7 |
| Missing event source URL / reversed stored date strings | 0 / 0 |

These measure field completeness, not total real family suitability: an untagged event may be suitable, but the product cannot reliably filter it. Nor do valid date strings prove real dates or correct opening hours.

There is concrete semantic noise. The live [Donausaal belegt listing](https://www.okolo.events/event/1650) presents a hall-booking notice as an outing, with venue “Sonstige.” The [municipal source](https://www.mauthausen.at/Donausaal_belegt_1) specifies Donausaal and all-day dates. Several weekend entries also appear duplicated, including Motorsporttage and a Hellmonsödt music-club excursion; those require source review before merging. A source being official does not make every calendar item a public event worth attending.

**Priority:** manually verify a family shortlist and the sources that serve it. Improve timing, location, eligibility, cancellation and duplicate handling before adding thousands more rows. Unknown facts must remain unknown; do not infer ages or prices to improve a completeness metric.

### Refresh: functioning automation, incomplete assurance

There are **1,935 registered sources**. Austria: 1,628 registered, 1,566 `works=true`; 177 working sources last crawled over seven days ago, including varied cadence/quarantine states. Of Austria's working sources, 193 are `tier=dead` and 11 marked blocked. These flags need interpretation, not blanket reactivation.

Bulgaria's 178 working sources and Germany's 88 were all last crawled over seven days ago: both countries are deliberately paused. Do not sell them as maintained coverage.

The [September 5 crawl](https://github.com/GeorgiKostov/eventmap/actions/runs/33954758702) processed 7,987 upserts and also recorded 12 fetch errors, two pipeline errors and 29 policy deferrals. September 2–5 completed successfully; [September 1 failed](https://github.com/GeorgiKostov/eventmap/actions/runs/33491554451). A green workflow is not evidence that each customer source refreshed correctly. Event `updated_at` is also not a last-checked timestamp: unchanged pages need not rewrite events.

## 3. Production readiness

**Suitable now:** discovery conversations, demo presentations and a private scoped preview. **Before a paid public launch:** resolve the following concrete gaps. **Not currently substantiated:** guaranteed concurrency, uptime, urgent update SLA, recovery time, ticket conversion or a self-service customer platform.

| Priority | Finding and evidence | Required outcome |
|---|---|---|
| High | `lib/analytics.js:33–43` initializes PostHog with a bundled-key fallback, automatic pageviews and `localStorage` persistence. `app/analytics.js:7` mounts it without a consent gate. DNT/internal exclusions exist, but no analytics consent UI was found. | Decide and implement a compliant measurement design before a customer embed. Persistent pseudonymous tracking is not made anonymous merely by omitting email. If using consented tracking, measure only consenting browsers and state the bias. If choosing genuinely aggregate measurement, explicitly accept that it cannot support the same visitor-retention metric. |
| High | Dependency audit above. Some Next advisories require absent features such as Server Actions, so exploitability varies. | Apply compatible fixes, assess remaining advisory prerequisites, run tests/build and actual auth/map/intake smoke checks. Do not blindly change major versions. |
| High for launch | Capacity rehearsal is still open in `tasks/todo.md:56`; no restore drill or current backup configuration established. | Test the intended programme and traffic band, verify backup/restore, preserve a last-good programme and rehearse recovery. State limits in the scope. |
| High for product trust | Missing family constraints, apparent non-events and potential duplicates in current Linz results. | Source-check every pilot item; reject booking/admin notices; resolve venues and start times; verify the consumer shortlist independently. |
| Medium | `scripts/rot-report.mjs` is manual and not called by checked-in scheduled workflows. Broad crawl alarms can miss one important source failing. | Customer-source freshness and expected-count alerts, named correction contact, alert delivery test. |
| Medium | No push/PR test/build gate in checked-in workflows; source-regex tests cannot replace browser/HTTP behavior. | Minimal release CI plus staging smoke checks of public reads, authenticated writes and customer source updates. |
| Medium | Removal notifications put general `ADMIN_TOKEN` in a URL; `app/api/admin/remove/route.js:13` changes state on GET. | Replace with narrowly scoped expiring tokens and explicit POST confirmation; test mail-scanner/prefetch behavior. |
| Medium | Privacy retention says newsletter data lasts until unsubscribe, but `lib/db.js:1637` marks it unsubscribed and retains it. No documented account-deletion procedure found. | Decide retention periods and evidence requirements, align copy and implementation, document deletion/export handling. Do not delete consent evidence blindly. |
| Medium | `app/impressum/page.js` still advertises the discontinued EU ODR platform. | Correct stale legal text in all languages. |
| Before paid prominence | Existing `gold` labels are only part of the repository's paid-placement guardrails; payer identity, ranking disclosure and advertiser terms remain unestablished. | Complete the existing compliance checklist before charging for prominence. A hosted-service fee need not imply paid ranking. |

The privacy concern is material: Austria's DSB says the terminal-storage rules extend beyond cookies, and nonessential behavioral analytics generally needs prior consent. Treat this as a specific remediation/legal-review issue, not a claim that EU hosting alone solves it. [DSB guidance](https://dsb.gv.at/faqs/datenschutz-cookies). The ODR platform closed on July 20, 2025. [European Commission](https://consumer-redress.ec.europa.eu/site-relocation_en?event=main.help.faq).

For dependency triage, the [Next Server Action advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) and [fetch cache-confusion advisory](https://github.com/vercel/next.js/security/advisories/GHSA-68g3-v927-f742) identify fixes after the locked version and specific prerequisites. No exploit testing was performed. Provider backup features also require checking the actual project configuration and demonstrating restoration. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

The foundation is sound: bounded PostGIS reads, transaction pooling, shared viewport cache keys, CDN caching, authenticated intake with ownership and SSRF defenses, durable rate limits, structured-first ingestion, bounded AI spend and idempotent newsletter delivery. Transient poster deletion is deliberate; permanent image storage is not a readiness requirement.

## 4. Do we have a good scaling plan?

**Yes for one to a few managed customers. No validated global cost/capacity model.** The August [partner-pilot scaling runbook](../ops/partner-pilot-scaling.md) is the right operating plan and is materially better than the July global architecture projections.

Follow this order:

1. **One signed pilot:** approved repeatable source, reviewed venues, stable URL, agreed correction cadence and branding. Publish a versioned last-good programme snapshot so normal visitors mostly receive cached content. This snapshot is planned work, not already proven customer infrastructure.
2. **Before launch:** bounded regional rehearsal, basemap failure with usable programme list, verified backup/recovery, health alerts, support window and documented spend limits. Existing targets include at least 95% cache-served repeated reads, warm API p95 below 300 ms and errors below 0.5%; they are proposed gates, not achieved performance claims.
3. **Second independent customer:** explicit partner/programme/event identifiers, versioned publication and isolated reporting. Exact `source_name` matching is adequate for a tightly controlled first configuration, not a durable tenant boundary. Repeated managed customers do not automatically require a self-service portal.
4. **Measured growth:** improve cache hit rates and query plans, then managed database capacity. Add MVT/vector tiles or replicas only when measured density, payload or latency requires them.
5. **Contract-driven dependencies:** owned regional PMTiles/CDN or managed geocoding only if required. Guest viewing should use pre-resolved venues and require no live geocoding. OpenFreeMap is provided without warranties, so do not promise a map SLA on its behalf. [Terms](https://openfreemap.org/tos/).

The July [global-scale.md](../architecture/global-scale.md) treats storage-only tile pricing as near-total cost and makes unsupported latency assurances. Request operations, workers, cache misses, map generation/update work, monitoring and founder operations time must be included. R2 has no egress fees but does charge for storage and operations; Protomaps explicitly discusses Workers costs and R2 latency. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Protomaps deployment](https://docs.protomaps.com/deploy/cloudflare). Do not use the old global monthly total in a quote or business forecast.

Data and operational scaling matter as much as traffic. Measure cost per successfully refreshed useful event, freshness of critical sources, correction workload, geographic precision and founder minutes per programme. Prefer licensed exports and shared CMS adapters to one bespoke scraper per customer. A vendor agreement is valuable only for data the participating publishers actually authorize for the intended reuse.

## 5. What to sell and what to defer

| Offer | Buyer/value | Recommendation |
|---|---|---|
| Managed event/programme map | Multi-venue organizer with its own website, email audience or print programme; less publishing work and clearer visitor navigation | **Sell first** |
| Recurring managed calendar/embed | Cultural network, city marketing group or organizer with repeated programmes; maintained publication and reporting | Test after the first delivery establishes workload |
| Approved source ingestion | Municipality/venue supplies a feed; Okolo gains fresh facts and the publisher receives attribution/linkback | Usually free supply cooperation; do not create double entry |
| Sponsored map/newsletter placement | Buyer pays for measurable relevant attention | Later: current reach is unproven and disclosure gates remain |
| Paid integration/setup work | Customer has a specific export, CMS or display problem and a budget | Quote a bounded deliverable; reject open-ended bespoke work |
| Data/API licensing | A business needs reliable rights-cleared data with service guarantees | Later, after field coverage, rights, freshness and demand are proven |
| Consumer subscription/ticketing/full organizer portal | A different retention, payments and support model | Defer; no evidence makes these the next task |

An individual small venue with one address may need its existing website calendar more than a map. Qualify for multiple venues, many timed programme points, fragmented publication and actual staff work. Ask why its present website, PDF, app or CMS is insufficient. Do not sell a replacement where the existing system works.

Likewise, structured markup is useful plumbing, not a defensible exclusive benefit. Google explicitly does not guarantee rich results from valid markup. [Google Event documentation](https://developers.google.com/search/docs/appearance/structured-data/event). Another live Linz discovery product already documents the same licensed municipal source. [inmycity source page](https://inmycity.app/linz/quellen). Treat competition as evidence that access and JSON-LD are reproducible. Okolo must earn preference through family usefulness, reliable coverage, distribution relationships and low organizer effort.

### Proposed first offer and economics

**Pricing hypotheses for discovery, not market benchmarks or approved prices:** test **€1,000–€2,000 for a small managed programme**, with a narrower scope at the lower end. Example scope: one programme, one approved export, up to 50 programme points/10 venues, one stable hosted URL and QR asset, one branding/acceptance round, a defined live window, scheduled updates and one use/referral report. Quote custom adapters, urgent event-day support, expanded languages, custom UI and embeds separately when they add work.

Test **€150–€350/month** for repeat programmes only after knowing maintenance demand, with update/support limits. Basic listings remain free. Separate any limited reference-pilot discount from the regular price. A free pilot is worthwhile only for a tightly bounded learning/distribution exchange; it does not prove willingness to pay. Obtain case-study permission separately.

Illustrative economics, excluding tax and general overhead: at **€1,800**, 20 hours valued internally at €50/hour plus €100 direct incremental cost leaves **€700**. At 40 hours it loses **€300**. The hours and costs are assumptions, not observed data. Scope and repeatability determine viability more than inference-token cost.

Two €1,800 projects plus four €250 retainers in a month means **€4,600 billings, only €1,000 recurring monthly revenue**, before delivery costs and tax. This is scenario arithmetic, not a sales forecast. Track sales time, acquisition cost, delivery hours and renewal; headline revenue alone can conceal a poorly paid agency job. Use taxation/invoicing appropriate to George's actual business status and agree payment milestones in the written quote.

## 6. Who to contact first

These are **verified public routing contacts, not evidence of interest, procurement authority or permission for sales email**. Start with accepted introductions and explicitly invited inquiries. Budget owners may differ from the people below.

| Priority / organization | Role and verified route | Specific first ask |
|---|---|---|
| 1. Ars Electronica | Existing friend introduction; festival team at `festival@ars.electronica.art`. [Official festival page](https://ars.electronica.art/festival/en/ars-electronica-festival/) | Friend obtains an accepted introduction to programme-data and visitor-marketing owners. Show existing demo; ask for a post-festival needs discussion and a small permitted data trial. Relationship first. |
| 2. Kinderkulturwoche / Linz Kultur | Organization team `info@kinderkulturwoche.linz.at`; Hanna Kolbe, Marketing/Presse, named on [press page](https://kinderkulturwoche.linz.at/presse/). [Contact](https://kinderkulturwoche.linz.at/kontakt/) | Best family-aligned pilot prospect: one programme map with source-backed age/day/place filtering, repeatable source and a link/QR through their own channels. Establish budget and print deadline before a preview. |
| 3. Linzer City Ring / City Shopping Linz | Ursula Fürstberger-Matthey, Citymanagerin, `management@linzer-city.at`; Elke Türkis, website/newsletter, `kontakt@linzer-city.at`. [Team](https://www.linzer-city.at/das-team/) | Which upcoming multi-location programme creates visitor-navigation/publishing work? Offer fixed-scope map hosting and reporting. Strong candidate for a paid service, budget unverified. |
| 4. Stadt Linz / Linztermine | `info@linztermine.at`, organizer team `eventmanager@linztermine.at`. [Contact](https://www.linztermine.at/kontakt) | Foundational supply: clarify current XML export, stable identifiers, cancellations and attribution. Offer quality feedback. Open-data use is not itself an official partnership. |
| 5. OÖ Familienkarte / Familienreferat | Anna Jachs, Homepage/App/Elternbildung, `anna.jachs@ooe.gv.at`; `familienreferat@ooe.gv.at`. [Team](https://www.familienkarte.at/de/kontakt/slide.ansprechpartner.html) | Authorized feed and a small Linz family-use test; request distribution only around demonstrable usefulness. Do not initially ask them to buy a competing calendar. |
| 6. Kinderfreunde Linz-Stadt | Eva Paunovic, Familienakademie/Eltern-Kind-Zentren, `eva.paunovic@kinderfreunde-linz.at`. [Team](https://kinderfreunde.at/ueber-uns/team?fwhid=41), [programme contact](https://kinderfreunde.at/angebote/detail/detail-1) | One or two centres supply a reliable programme and optionally invite parents to the test. Parents opt in themselves; no contact-list transfer. |
| 7. Linz Tourismus | Gisela Gruber, Organisation/Projekte/Region Linz, `gisela.gruber@linztourismus.at`; general `office@linztourismus.at`. [Team](https://www.linztourismus.at/freizeit/reise-planen/gut-zu-wissen/team?scale=2) | Trial a family-weekend discovery link through one visitor-information/hotel channel; learn what their existing calendar lacks. |
| 8. PlusCity | Service centre routes to marketing/events: `servicecenter@pluscity.at`. [Contact](https://www.pluscity.at/kontakt) | Later family campaign/distribution prospect. Their [existing events/app offering](https://www.pluscity.at/events) already includes map functionality; do not pitch generic replacement wayfinding. |
| 9. RiS GmbH / GEM2GO | `office@ris.at`. [Imprint](https://www.gem2go.info/de-at/service/impressum) | One consenting municipality, sanctioned event export, update/delete semantics and reuse permissions; expand only after proof. **RiS/GEM2GO is one vendor/product relationship**, not two independent integrations. |
| 10. feratel / Open Data Platform | Explicit [product inquiry channel](https://www.feratel.de/unsere-loesungen/open-data-plattform/) | Ask what Linz/OÖ inventory is available and licensed for commercial reuse. Open data and a proprietary Deskline agreement are different routes. |

**Immediate dates:** Ars Festival runs **September 9–13**. A full new 2026 service four days before opening is an avoidable delivery risk. Its official **AI Hackathon is September 11–12 at Grand Garage, free registration closes September 7**, with festival staff and city-data mentors. This is a relevant introduction opportunity if the two-day commitment fits; participation is optional and does not grant production data/brand rights. [Official hackathon](https://hackathon.ars.electronica.art/en/hackathon/). Kinderkulturwoche runs **October 14–25, 2026**, giving more preparation time, although budget/print deadlines may already be earlier. [Official city-marketing listing](https://www.linzer-city.at/events/kinderkulturwoche/).

**Supply discovery:** Linztermine's [terms](https://www.linztermine.at/nutzungsbedingungen) explicitly license event information/text through XML under CC BY 4.0. The official [hackathon data notes](https://hackathon.ars.electronica.art/en/datasets/linztermine/) describe four XML endpoints including `events_xml.php`, with known location-reference/encoding caveats. The old assumption that an `eventExport` API-key email is the blocker needs rechecking. The feeds were not bulk-fetched or integrated in this review. Keep original descriptions and no source images under the repository's stricter policy.

Familienkarte's commercial Vorteilsgeber directory is a separate route through Marketingservice Thomas Mikscha, not the same as the Familienreferat data/app relationship. [Vorteilsgeber information](https://www.familienkarte.at/de/familienkarte/vorteilsgeber/vorteilsgebersuche.html).

## 7. How to approach them

The old tracker says “George sends” but that is not permission to send unsolicited commercial pitches. Austrian TKG restrictions cover promotional email and telephone calls, including B2B and first-contact promotion. A published address is not consent; asking for consent in an unsolicited advertising email is not a workaround. [TKG §174](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20011678&Paragraf=174), [WKO guidance](https://www.wko.at/information-consulting/werbung-marktkommunikation/werbung-per-telefon-fax-e-mail-sms-was-ist-erlaubt).

Use accepted warm introductions, genuine in-person networking, responses to explicit invitations, or an appropriate addressed postal introduction with an invitation to request a demo. Respect objections and personal-data duties. General contact forms, social DMs, a free offer or “research” wording are not automatic exceptions. Keep official data-support questions within the invited service's scope; assess mixed promotional inquiries properly.

First conversation, approximately 20 minutes:

1. How is the programme published now, and who updates it?
2. Where do visitors struggle: finding events, choosing by age/time, reaching venues or seeing changes?
3. Which website, newsletter, QR/signage or printed programme can carry the link?
4. Who owns the source, who can authorize its reuse and who approves budget?
5. What is the real print/launch deadline and urgent-correction expectation?
6. What small result would make a pilot worth paying for, and would they request a scoped quote?

Record contact/invitation basis, named owner, problem, source rights, timing, budget status, agreed next action and follow-up date. An interesting conversation or unsigned letter of intent is not revenue. Count a signed paid scope/deposit and then the delivered, paid invoice separately.

**German follow-up draft, only after an accepted introduction/request:**

> Betreff: Wie besprochen: eine Programmkarte für [Veranstaltung]
>
> Guten Tag [Name],
>
> danke für das Gespräch. Mit Okolo bereite ich vorhandene Veranstaltungsprogramme als mobile Karte mit Orten, Tagen und Zeiten auf. Gäste öffnen sie über Ihren Link oder QR-Code; Ihr Team pflegt das Programm weiterhin in der vereinbarten offiziellen Quelle.
>
> Für [Veranstaltung] schlage ich einen kleinen betreuten Pilot vor: eine gehostete Karte, freigegebene Gestaltung, vereinbarte Aktualisierungen und anschließend ein Bericht über Nutzung und Klicks zu Ihren offiziellen Seiten. Eine Beispielkarte sehen Sie unter https://www.okolo.events/partners/demo.
>
> Wie vereinbart, würde ich mit [Verantwortliche Person] Umfang, Programmquelle und Veröffentlichungstermin klären und Ihnen danach ein Festpreisangebot schicken. Wir versprechen dabei keine bestimmte Reichweite oder Ticketverkäufe.
>
> Freundliche Grüße
> Georgi Kostov · Okolo

## 8. How customers integrate their events

Start with **their current source**, not a new tool they must maintain.

| Existing source | Initial approach | What must be established |
|---|---|---|
| iCal/RSS/Event JSON-LD | Register through the existing ingestion waterfall | Rights, complete occurrence coverage, stable identity and reliable source links |
| Official XML/API | Small adapter in the existing crawl path | Access, license, pagination, update/cancellation rules and expected-count fixture |
| Published Sheet/CSV | Agreed stable export plus a scoped adapter | Refreshable URL, stable IDs, field contract and access rights; emailed files alone are not recurring refresh |
| Existing CMS without usable export | Work with their web agency/vendor on the smallest export | They maintain their CMS; Okolo maintains ingestion |
| Vendor genuinely requires push | Design authenticated, idempotent API/webhook after a committed requirement | Scoped credentials, ownership, stable IDs, cancellation/delete/version semantics and auditability |

For any partner, define upstream event/occurrence IDs, title, real start/end/timezone, venue identity/coordinates, canonical URL, explicit cancellation state and last-modified/version. Prices/ages/accessibility remain null unless verified. Vienna-local storage remains the current AT contract. A missed/partial fetch must not delete a programme; cancellation needs explicit publisher evidence or an agreed complete-snapshot reconciliation rule.

The first source must be `works=true`, registered and successfully reachable through the real `scripts/crawl.mjs` path. No speculative open-source plugin, general integration portal or organizer RBAC until repeated customers require it.

## 9. Thirty, sixty and ninety days

Assumption: George remains the sole commercial/delivery owner and can reserve roughly two focused half-days a week for conversations and local distribution, alongside engineering. These are proposed targets, not promises or statistical market benchmarks.

| Window | George | Engineering / operations | Evidence to exit |
|---|---|---|---|
| Sept 5–11 | Pursue accepted Ars introduction; decide on Sept 7 hackathon deadline; prioritize Kinderkulturwoche and Linzer City; request needs conversations | Privacy/dependency remediation plan; validate a Linz family shortlist; inspect backup/recovery and measurements | Named prospects with invitation basis and next step; ranked launch blockers |
| By Oct 5 | Aim for 5 qualified conversations, 2 requested written scopes and 1 paid pilot commitment; recruit 30–50 opted-in local households through 2–3 permitted distribution partners | Build only the agreed pilot delta; source proof, last-good snapshot, bounded rehearsal, alert/restore drill and first proof report | One paid scope or documented objections explaining why not; observed family sessions and early return counts |
| By Nov 4 | Deliver agreed pilot, invoice/collect, ask separately for reference permission; complete four consecutive measured weekends once cohort/measurement ready | Fix issues observed during real use; report source completeness, referrals, errors and correction time | Four-weekend consumer evidence; actual delivery hours and pilot contribution margin |
| By Dec 4 | Seek repeat booking/retainer or second independent customer; compare both tests | Introduce durable partner IDs if second deal signed; automate only repeated delivery work | Renewal/repeat demand plus acceptable labor margin, or an explicit decision to revise/stop the offer |

Do not delay customer discovery for infrastructure perfection. Do not launch the paid programme before its release gates pass. Do not count the September 5–6 weekend as part of a prospectively measured cohort that was not yet recruited.

### Family-validation scorecard

Keep the design doc's **at least 30% distinctive useful-event supply** gate, but define the denominator: a preselected weekly sample of 20 genuinely relevant Linz-region family outings, source-verified and compared manually to named major calendars on the same date. Record whether the alternatives actually cover each occurrence. No bulk copying of competitor databases. Twenty sampled outings is directional evidence, not a regionwide completeness estimate.

Recruit an initial 30–50 households to expose usability/quality failures; grow toward 100+ activated local users before treating rates as stable. Report exact numerator/denominator and cohort size. Do not make subscriber count alone the activation measure.

Proposed initial activation: user finds a suitable outing and takes a meaningful next step (source/directions/calendar/save), supplemented by adult interviews. Proposed retention target: **at least 30% of an activated cohort returns with a meaningful action in the following weekend**, measured over four consecutive weekends. This percentage is a suggested decision threshold, not an established benchmark or existing locked rule. Track week-4 retention too. Separate newsletter-driven, partner-driven and unprompted return; two visits on different weekdays are not automatically weekly retention. Privacy design must support the chosen measure or replace it with a consented research cohort.

Every week inspect: source/date/location accuracy, missing constraints, non-events/duplicates, coverage novelty, meaningful actions, next-weekend return, active confirmed list growth, and founder time. Email opens and link clicks are supporting signals; neither establishes attendance or sales. A tiny sample cannot justify an advertising rate card.

### Commercial-validation scorecard

Track accepted introduction → qualified problem/budget owner → requested quote → signed paid scope → launch → paid invoice → repeat purchase. Capture reasons for every loss. Track delivery hours and support burden per customer. If five well-qualified conversations produce no request for a quote, revise the offer before building more. If delivery routinely requires 40 bespoke hours at first-pilot pricing, narrow scope or raise the tested price.

If organizers pay and renew but consumer retention remains weak, George can explicitly choose a service business. If families retain but organizers do not buy maps, test a different paid benefit only after reach and consent evidence support it. Neither result should be hidden under more feature shipping.

## 10. Documentation and decision hygiene

The existing plans are mostly good; execution and truthful status are the gap. The queue mixes July open items with later completed work (accounts, deployment, newsletters, source adapters). The growth document's historical “supply solved” claim and old subscriber counts should not be used as current facts. The design document's reference to RiS and GEM2GO as two vendors is misleading. Some old outreach promises of “zero work” and guaranteed discoverability are too strong. The August managed-pilot approval supersedes older blanket objections to any bespoke partner work.

Use this dated review alongside the [current delivery runbook](../ops/partner-pilot-scaling.md) and [measurement contract](../ops/advertiser-proof.md). Reconcile stale active-status notes as a separate surgical documentation task; retain dated historical evidence. The analysis does not approve new prices, legal positions, customer contracts, hosting spend, data storage policies or further geography.

**Recommended decision for George:** authorize pursuit of one paid managed programme pilot, with the launch gates above, while concentrating consumer validation on Linz. The next scarce inputs are accepted conversations, reliable family information and measured repeat use.
