# Partnerships & data cooperation — tracker

One place for every organisation we want a data relationship with, in every country. **George
sends all of these** — nothing here is sent by an agent. Update the Status column when you send or
hear back; that is the whole point of the file.

Full ready-to-send drafts for the first four targets already exist in
[`briefs/outreach-emails-de.md`](../../briefs/outreach-emails-de.md) (verified contacts, German,
Sie-Form). New targets found on 2026-07-14 have their drafts in §4 below.

## 1. The two rules that govern every message here

1. **No invented numbers.** Okolo is pre-launch: no user counts, no traffic, no growth claims.
   The value we offer is real without them (linkback, discoverability, zero work for them).
2. **We are asking for a cleaner path, not for permission to exist.** We already index event
   *facts* (title, date, place) with a link back to the source — facts aren't copyrightable and
   this isn't new activity we're disclosing. Every mail asks for cooperation or a feed. None of
   them read as an admission.

## 2. The boilerplate (reuse verbatim; keep it this short)

**Who we are.** Okolo (okolo.events) is a free, family-focused event map for Austria: parents open
one map and see what's on around them this weekend. We index event facts — title, date, venue —
and always link back to the organiser's own page.

**What we ask.** Access to your event data in a machine-readable form (API, XML/JSON feed, iCal) so
we display it correctly and always up to date, instead of reading your public web pages.

**What you get.** Every event carries your name and a link back to your page. Your events become
findable in Google and in AI assistants through our structured data (schema.org/JSON-LD). No work
on your side beyond granting access. No cost, no exclusivity, and we drop any source on request.

## 3. Status tracker

| # | Country | Partner | What we want | Contact | Status | Next step |
|---|---|---|---|---|---|---|
| 1 | AT | **Stadt Linz — Linztermine** | `eventExport` XML API (CC-BY-4.0, has `properforchildren` + `freeofcharge`). Replaces an HTML scrape that breaks on every month rollover. **Highest value: a licensed feed for our most important city.** | `open.commons@linz.at`, cc `komm@mag.linz.at` | ✉️ Draft ready ([briefs](../../briefs/outreach-emails-de.md#1-stadt-linz--linztermine--api-access)) | George sends |
| 2 | AT | **Österreich Werbung** | ContentDB / LTO API key (CC-BY-4.0 aggregate of Austrian tourism boards; skews family/seasonal) | `martin.reichhart@austria.info`, cc `api@austria.info` | ✉️ Draft ready ([briefs](../../briefs/outreach-emails-de.md)) | George sends |
| 3 | AT | **Land OÖ — Familienkarte** | Event feed + cooperation. **Exactly our audience.** Their site only returns today's listings without a POST. | `familienreferat@ooe.gv.at`, cc `anna.jachs@ooe.gv.at` | ✉️ Draft ready ([briefs](../../briefs/outreach-emails-de.md)) | George sends |
| 4 | AT | **tips.at** | Regional media content partnership (lowest priority, value-exchange framing) | see briefs | ✉️ Draft ready | Optional |
| 5 | AT | **feratel Deskline** | Data interface (**Deskline 3.0 Standard Interface**, XML/SOAP, partner agreement) **or** their free **Open Data Platform** registration. Deskline powers a large share of Austrian Tourismusverbände — their event widget is a Shadow-DOM SPA we deliberately do **not** scrape, so a feed is the only route. **One agreement ≈ many regions.** | `servicecenter@feratel.com` | ✉️ Draft below (§4.1) | George sends |
| 6 | AT | **RiS GmbH (GEM2GO)** | Ask whether a sanctioned central feed exists for the ~1,300 municipalities on their platform. We already crawl member sites legally and politely; a feed would be cheaper for *their* servers too. **No public API is documented — this is a question, not a demand.** | `office@ris.at` | ✉️ Draft below (§4.2) | George sends (low expectation) |
| 7 | AT | **Land NÖ — Veranstaltungsdatenbank NÖ** | An official Lower-Austria event database that GEM2GO itself consumes via an existing interface. If it's open to third parties it covers NÖ (our largest region: 7.6k events) in one integration. **Contact UNVERIFIED — needs a 10-minute look before sending.** | *to find* | 🔍 Research first | Find the responsible Land NÖ department |
| 8b | DE | **Landeshauptstadt Stuttgart** | Permission to index event **facts** with linkback, despite their `User-agent: ClaudeBot / Disallow: /`. We are not a training crawler: we store title/date/place, write our own descriptions, and every event links back to stuttgart.de. Ask for a WAF/robots carve-out for `UmkreisBot`, or a sanctioned feed. **Biggest city in the DE scope — currently contributes 0.** | *to find (Stadt Stuttgart Online-Redaktion)* | 🔍 **Reopened 2026-07-16** — see below | Find the contact, then send |
| — | DE | ~~Stadt Stuttgart (robots RSS path)~~ | ~~Permission for a robots-blocked RSS path~~ | — | ✅ **Not needed, and superseded.** The 2026-07-14 "block" really was our own parser bug — the RSS path is open to us. But the 2026-07-16 sweep found stuttgart.de *separately* names **ClaudeBot/GPTBot** with `Disallow: /`, which our policy honors (`docs/decisions/2026-07-16-ai-bot-policy.md`). Both findings are true; they are different blocks. Superseded by row 8b. | Closed 2026-07-14, superseded 2026-07-16 |
| 8 | BG | *(no target yet)* | Research found **no clean licensed BG event feed** and no reusable open-source project. Bulgarian supply stays crawl-first; the real BG gap is Facebook events, which is a product decision, not a partnership. | — | ⏸️ None | Revisit post-Linz |

**Explicitly not partnership targets** (closed data, commercial aggregators — we neither scrape nor
ask): alpenvereinaktiv (Outdooractive), bergfex, komoot, Mamilade. If any of them ever becomes
interesting it is a *commercial licensing* conversation, not a data-cooperation one.

## 4. Drafts for the new targets

### 4.1 feratel — Deskline data interface

> **An:** servicecenter@feratel.com
> **Betreff:** Anfrage Datenschnittstelle Deskline / Open Data Platform — Veranstaltungsdaten
>
> Sehr geehrte Damen und Herren,
>
> ich betreibe **Okolo** (okolo.events), eine kostenlose, familienorientierte Veranstaltungskarte
> für Österreich: Eltern öffnen eine Karte und sehen, was am Wochenende in ihrer Umgebung
> stattfindet. Wir zeigen ausschließlich Veranstaltungs-*Fakten* (Titel, Datum, Ort) und verlinken
> immer zurück auf die Seite des Veranstalters.
>
> Zahlreiche österreichische Tourismusverbände verwalten ihre Veranstaltungen über Deskline. Wir
> möchten diese Daten korrekt und aktuell darstellen — und zwar über eine offizielle Schnittstelle
> statt über das Auslesen von Webseiten.
>
> Konkret zwei Fragen:
> 1. Unter welchen Bedingungen ist ein Zugang zum **Deskline 3.0 Standard Interface** für
>    Veranstaltungsdaten möglich (pro Region bzw. TVB)?
> 2. Ist die **feratel Open Data Platform** für unseren Anwendungsfall der geeignetere Weg, und
>    wie erfolgt dort die Registrierung?
>
> Was die Verbände davon haben: Jede Veranstaltung nennt die Quelle und verlinkt zurück; durch
> unsere strukturierten Daten (schema.org/JSON-LD) werden die Veranstaltungen zusätzlich in Google
> und in KI-Assistenten auffindbar. Aufwand entsteht keiner, Kosten ebenfalls nicht, und wir
> entfernen jede Quelle auf Wunsch wieder.
>
> Für ein kurzes Gespräch stehe ich gerne zur Verfügung.
>
> Mit freundlichen Grüßen
> Georgi Kostov · Okolo · okolo.events · hello@okolo.events

### 4.2 RiS GmbH (GEM2GO) — sanctioned feed?

> **An:** office@ris.at
> **Betreff:** Frage zu einer offiziellen Veranstaltungs-Schnittstelle (GEM2GO-Gemeinden)
>
> Sehr geehrte Damen und Herren,
>
> ich betreibe **Okolo** (okolo.events), eine kostenlose Veranstaltungskarte für Familien in
> Österreich. Wir indexieren Veranstaltungs-Fakten (Titel, Datum, Ort) und verlinken immer zurück
> auf die jeweilige Gemeindeseite.
>
> Viele Gemeinden veröffentlichen ihre Veranstaltungen über GEM2GO. Wir lesen diese öffentlichen
> Seiten derzeit rücksichtsvoll aus (identifizierender User-Agent, robots.txt wird eingehalten,
> maximal eine Anfrage pro Sekunde und Host).
>
> Meine Frage: **Gibt es eine offizielle Schnittstelle oder einen Datenfeed**, über den
> Veranstaltungsdaten teilnehmender Gemeinden bezogen werden können? Das wäre für beide Seiten
> effizienter — insbesondere für Ihre Server — und für uns die verlässlichere Quelle.
>
> Falls eine solche Schnittstelle nicht existiert oder nicht für Dritte vorgesehen ist, richten wir
> uns selbstverständlich danach.
>
> Mit freundlichen Grüßen
> Georgi Kostov · Okolo · okolo.events · hello@okolo.events

### 4.3 Land NÖ — Veranstaltungsdatenbank NÖ

**Do not send yet — the contact is unverified.** GEM2GO's own materials mention a
"Schnittstelle zur Veranstaltungsdatenbank NÖ", i.e. Lower Austria appears to run an official event
database that third parties already consume. NÖ is our largest region (7.6k events), so one
integration would be worth more than a dozen municipal parsers. **Next step:** identify the
responsible department at Amt der NÖ Landesregierung (likely the culture/tourism or the open-data
office via data.gv.at), then reuse the §4.1 structure verbatim.

## 5. When a reply lands

- **Yes / here's a key** → note it here, then implement the feed as a normal `sources` row with its
  own adapter (hard rule 7: it must be reachable by `scripts/crawl.mjs`, not a one-off import).
- **No** → record it here so nobody re-asks in six months. Keep crawling the public pages if that
  was already allowed; a declined *cooperation* is not a withdrawal of permission to read public
  facts, and we never treat it as one.
- **"Please stop"** → we stop, immediately, and mark the source `works=false` with the reason. Our
  legal posture is worth more than any single source.

## 6. How publishers give us cleaner data — the integration ladder

George asked (2026-07-15): "make an open-source API they integrate? ask them to format their data?
have them push to us when they post?" **Answer: don't build an API.** We already ingest the open
standards (`scripts/crawl.mjs` consumes iCal, RSS, and schema.org/Event JSON-LD). The work is
packaging and incentives, not engineering — and it is a **post-Linz play**, because the whole pitch
only lands once we have an audience to offer as the carrot (today: 1 subscriber). This extends the
[middle-layer strategy](../decisions/2026-07-11-middle-layer-strategy.md): trade distribution for supply.

**The ladder, ranked by THEIR effort (the only ranking that matters):**

| Their effort | What | Who it fits | We support it? |
|---|---|---|---|
| 30 seconds | Paste us a **feed URL** (iCal/RSS) | Any modern CMS already exports one | ✅ pipeline eats it today |
| One-time paste | Add **schema.org/Event JSON-LD** to pages they already publish | Anyone with a web person — and it *also* gets them into Google Events (shared incentive) | ✅ parsed today |
| Per event | Our **submit form / "claim your event"** | Motivated organizers (festival, theatre, Verein) | ✅ add-event exists; claim-flow backlog |
| Real integration | Webhook/API push on publish | Only a **platform vendor**, never an individual clerk | build only if a vendor asks |

**The "open-source API" instinct, done right:** not an API they call — an open **ingestion spec + a
live preview/validator** ("paste a URL, see exactly the events we'd extract, before committing"). The
scalable version is an **open-source WordPress/TYPO3 plugin** that emits correct Event JSON-LD: fix the
CMS-vendor layer, not each leaf.

**The real scale lever is vendor-level, and it's an email not code.** ~5 CMS vendors sit behind
thousands of Austrian sites — GEM2GO/RiS (~1,300 municipalities), feratel (tourism), the diocese
`siteswift` platform, DVV. One vendor exposing a standard export = hundreds of publishers in a single
integration. Those asks are §3/§4 above.

**Two honest constraints:** (1) most municipal clerks will do none of this, so publisher-push is a
**complement to crawling, never a replacement** — crawling stays the floor. (2) It's post-Linz: build
the "Add your events" page (small — ingestion already exists) the day a real organizer asks or the
Linz test proves demand, not before.
