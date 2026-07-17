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
| 9 | AT | **Ars Electronica Festival** — *first ORGANISER, not a data vendor* | Programme data at a re-fetchable URL (many venues → the Pflasterspektakel shape) + an optional mention in visitor info + reference permission. **Different deal shape → its own section: [§7](#7-event-organisers--a-different-deal-shape-added-2026-07-16).** Strategic kicker: Ars Electronica Linz GmbH is a **City of Linz** company — the owner of row 1's Linztermine API. | Warm intro via George's friend; owner **not yet named** | 🤝 **Warm intro in progress** (George contacted his friend 2026-07-16). Drafts ready: friend §7.7, contact §7.8 | George asks the friend for **(a) the data owner, (b) is it interesting, (c) the marketing/print DEADLINE** — (c) decides 2026 vs 2027. Then §7.5 label fork. |

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

---

## 7. Event organisers — a different deal shape (added 2026-07-16)

Everything in §3 is a **data vendor**: we ask a clerk or a platform for a feed, and we offer linkback.
An **organiser** is not that. A decentralized festival — many venues, many acts, one city — has a
problem we can actually solve for them, so this is not a favour we're asking. The framing inverts:
**their visitors have a wayfinding problem; we already are the map.**

### 7.1 Why this is worth doing (the honest version)

1. **It attacks the only bottleneck we have.** Supply is 28k events; the audience is a few dozen
   people (growth-system §2). A festival's marketing reaches exactly the local families we need, at
   *their* cost. That is the cheapest audience acquisition available to us, and it isn't code.
2. **The reference compounds, and it points at target #1.** Ars Electronica Linz GmbH is a company of
   the **City of Linz** — the same city whose Linztermine `eventExport` API is tracker row 1, where we
   are currently cold-mailing `open.commons@linz.at`. An organiser inside the city group vouching for
   us is a warmer path to that feed than any email we can write. *(Ownership worth confirming before
   leaning on it in a room.)*
3. **We have already paid the price of the alternative.** Pflasterspektakel is the identical shape
   (35 Spielorte, per-act grid). Scraping it cost a bespoke adapter, a date trap, a near-miss where
   every stage would have auto-merged, and its own workflow — and the happy path still can't be
   verified until the grid exists on 23 July. Handed the data, we get it correctly on day one.

### 7.2 The three risks (name them, or they happen)

1. **It can quietly become a B2B pivot before the B2C test.** "A map service for decentralized events"
   is a different product with different customers. CLAUDE.md is explicit: don't build past what the
   four-weekend test needs. **Discipline: build NOTHING bespoke for festival #1.** Everything the deal
   needs already exists — crawl + adapters, `highlights` (editorial tier), `/weekend/<city>`, the map.
   If they want a custom widget, that is a post-test conversation and probably a paid one.
2. **Institutional asymmetry.** They have a marketing department, a budget, and their own festival app.
   The risk is not "no" — it's a friendly "sounds nice" that nobody on their side owns. **Only the warm
   intro fixes this**, and only if it's used to name an owner rather than to bless the idea.
3. **Print deadlines are the binding constraint, not enthusiasm.** Programme and marketing materials
   lock months before a September festival. **Ask the deadline before anything else** — it decides
   whether 2026 is real or whether this is a 2027 placement with a 2026 data pilot.

### 7.3 What we are NOT to them

Not their festival app, and never pitch it that way — they have a programme and probably an app, so
"we'll map your festival" reads as naive. We are the layer their own programme structurally cannot be:
**the rest of the city.** A visitor asking "what else is on while we're here, and what can we do with
the kids between two shows" is not served by a festival programme, by construction.

### 7.4 The deal (one page, no lawyers)

| | |
|---|---|
| **They publish** | Programme data at a **re-fetchable URL** — published Google Sheet (CSV export), iCal, an existing export, or Event JSON-LD on pages they already have. Per programme point: title, start (+end), venue, and a link. |
| **They may do** | Mention Okolo in visitor info / programme as the map view. Let us name them as a reference. **Neither is a condition — see 7.5.** |
| **We do** | Every programme point on the map at its real venue, free; linkback to their page on every event; editorial highlight for the festival period; a shareable `/weekend/linz` link; errors fixed fast; one contact (George). |
| **Neither** | No cost, no exclusivity, no data claims. They say stop, we drop it that day (§5). No custom build. |
| **Term** | This festival, then both sides look at it again. Sign nothing longer. |

**Hard rule 7 shapes the ask and is not negotiable:** they must *publish* to a URL we can re-read, not
email us a file. A CSV that arrives once by mail is exactly the `works=false` + "refresh only with
script X" antipattern that silently rotted the Stuttgart sources. A published Sheet counts — it has a
stable URL. Registered in `sources` with `works=true` and driven with `npm run crawl -- --url` before
the deal is called done.

### 7.5 ⚠️ The labelling fork — decide before terms are discussed

"They put us in their marketing" is a benefit in kind flowing to us. Consideration in EU advertising
law is not only cash, so **if the highlight is given *in exchange for* the mention, the conservative
read is a paid placement** — „Anzeige", payer identity, ranking disclosure
([compliance doc](../decisions/2026-07-12-paid-placement-compliance.md)). This is live, not academic:
`Ars Electronica Festival 2026` is already a **gold** row in prod (07-16 → 09-09).

The fix is to make the reality match, not to find a form of words:

- **Editorial (recommended).** We list and highlight it because it is a major public event that is
  editorially interesting — which is *true*: it was highlighted before any contact, and
  Pflasterspektakel got the same treatment with no deal at all. They mention us only if it helps their
  visitors. Nothing is conditional, so nothing is consideration, so no label is owed.
- **Paid.** If we ever make it conditional ("no mention, no highlight"), it is gold and the two
  obligations ship first.

**Practical consequence for the email: never write „im Gegenzug" / "in exchange for".** Ask for the
mention as a separate, optional good — which also reads as more confident, not less. Switch the prod
row from gold → editorial unless it is genuinely being sold.

### 7.6 Sequence — the friend is the asset, don't spend it on a pitch

The mistake is sending a friend a polished partnership deck: that converts a friend into a gatekeeper
and burns the warmth. A friend's highest-value gift is **a name, a reality check, and a deadline** —
none of which costs them political capital.

1. **Friend, informally (7.7).** Who owns programme data? Who owns visitor info/marketing? Is this
   even interesting, or solved internally? When do materials lock? Give them an easy "nah, it's
   nothing" exit — that is what makes the answer honest.
2. **Named person (7.8)**, friend's name in line one.
3. **15 minutes, in person if offered.** Show the map with their festival already on it.
4. **Reply lands → §5.** Row in §3, source registered, `--url` verified.

### 7.7 Draft — message to the friend (informal; use whatever language you two speak)

```
Hey [Name],

kurze Frage, kein Pitch: Ich baue Okolo (okolo.events) — eine Karte, auf der man sieht,
was rundherum los ist. Familien-Fokus, Linz und Umgebung.

Beim Festival denk ich mir: die Leute laufen zwischen den Spielorten herum, und "was ist
grad in meiner Nähe" beantwortet eine Karte einfacher als ein Programmheft. Ars-Sachen
sind bei uns sowieso schon drauf — ich hätt sie nur gern *richtig* drauf, also mit den
echten Orten und Zeiten pro Programmpunkt.

Drei Fragen an dich, bevor ich irgendwen anschreibe:
1. Wer hat bei euch die Programmdaten in der Hand — und wer die Besucherinfo/Marketing?
2. Ist das überhaupt interessant, oder habt ihr das intern eh schon gelöst?
3. Bis wann müsste sowas stehen, damit es noch ins Programm/Marketing kommt?

Kein Stress — sag ruhig, wenn's nix ist.
```

### 7.8 Draft — email to the named contact (German, Sie-Form, from George)

```
Betreff: Okolo — das Festivalprogramm auf einer Karte für Ihre Besucher:innen

Sehr geehrte Frau / Sehr geehrter Herr [Name],

[Freund:in] hat mir Ihren Kontakt gegeben — danke vorab für Ihre Zeit.

mein Name ist Georgi Kostov, ich baue Okolo (okolo.events): eine freie, familien-
orientierte Veranstaltungskarte für Linz und Umgebung. Man öffnet eine Karte und sieht,
was rundherum stattfindet. Wir zeigen Veranstaltungsdaten — Titel, Datum, Ort — und
verlinken immer auf die Seite des Veranstalters zurück. Texte oder Bilder übernehmen
wir nicht.

Das Ars Electronica Festival ist bei uns bereits gelistet, über die öffentlichen Quellen.
Bei einem Festival mit vielen Spielorten ist eine Karte aber nur so gut wie die Daten
dahinter — und uns fehlen die genauen Orte und Zeiten der einzelnen Programmpunkte.

Mein Vorschlag, ohne nennenswerten Aufwand auf Ihrer Seite:

- Sie stellen das Programm maschinenlesbar bereit. Das kann eine veröffentlichte Tabelle
  (CSV / Google Sheet), ein iCal-Feed oder ein bestehender Export sein. Wichtig ist nur
  eine feste URL, die wir regelmäßig lesen dürfen — dann kommen Änderungen automatisch
  an, ohne dass jemand bei Ihnen etwas nachliefern muss.
- Wir stellen jeden Programmpunkt am richtigen Ort dar, mit Rückverlinkung auf
  ars.electronica.art, und heben das Festival während des Festivalzeitraums hervor.
- Kostenlos, keine Exklusivität, keine Datenansprüche. Ein Wort von Ihnen und wir nehmen
  es wieder heraus.

Für Ihre Besucher:innen beantwortet das eine Frage, die ein Programmheft naturgemäß
schwer beantwortet: "Was ist gerade in meiner Nähe?" — und für Familien zusätzlich:
was ist sonst noch in der Stadt, während wir da sind. Okolo ersetzt Ihr Programm nicht,
sondern führt zu ihm hin.

Zwei Bitten, beide ausdrücklich ohne Bedingung:

- Wenn Sie es für Ihre Besucher:innen sinnvoll finden, freuen wir uns über eine Erwähnung
  in Ihrer Besucherinfo — als Kartenansicht des Programms. Die Darstellung auf der Karte
  hängt nicht davon ab.
- Dürfte ich Ars Electronica als Referenz nennen, wenn ich mit anderen Veranstaltern in
  Linz spreche?

Gerne zeige ich Ihnen das in 15 Minuten — telefonisch oder bei Ihnen vor Ort.

Beste Grüße
Georgi Kostov
Okolo — okolo.events
```

**Voice notes:** no numbers appear (§1 rule 1 — we are pre-launch and have none worth naming);
"bereits gelistet" is stated plainly, because it's true and it is not something we are asking
permission for (§1 rule 2); the two asks are explicitly unconditional (§7.5); the close is 15
minutes, not a meeting.
