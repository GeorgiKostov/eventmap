# Partnership outreach — four targets, ready-to-send drafts

Prepared 2026-07-12 by the Researcher agent, per George's request. No emails sent, no commits —
this is a briefing document only. Draft emails are in German (Sie-Form), from George
(Georgi Kostov), signed as Okolo (okolo.events). Builds on
[docs/research/open-event-sources.md](../docs/research/open-event-sources.md) and
[docs/decisions/2026-07-11-middle-layer-strategy.md](../docs/decisions/2026-07-11-middle-layer-strategy.md).

**Legal posture used throughout:** we already display event *facts* (title/date/place) with
source linkback — facts are not copyrightable, and this isn't new activity these emails are
disclosing. Every draft below asks for *cooperation or a cleaner feed*, not permission to do
something we haven't started. None of them read as an admission of wrongdoing.

**No fabricated numbers.** No user counts, traffic figures, or growth claims appear anywhere —
Okolo is pre-launch. Value pitched is strictly: linkback, Google/AI discoverability, zero added
work for the recipient.

---

## 1. Stadt Linz / Linztermine — API access

### Contact (verified)

Pulled directly from the **data.gv.at dataset metadata page** for the Linztermine dataset
(`dfa2ff35-d2c4-4196-9989-a1bdbeabbfed`), fetched live via browser
(https://www.data.gv.at/katalog/datasets/dfa2ff35-d2c4-4196-9989-a1bdbeabbfed). The page hides
both addresses behind an "E-Mail anzeigen" reveal control; both were extracted from the rendered
DOM, so these are the actual metadata-listed addresses, not guesses:

| Role | Name | Email | Verified |
|---|---|---|---|
| Veröffentlichende Stelle (data owner) | Stadt Linz | **open.commons@linz.at** | Yes — data.gv.at dataset metadata |
| Kontaktmöglichkeiten (named dept.) | Magistrat der Landeshauptstadt Linz, Kommunikation und Marketing (KOMM) / Onlineservices | **komm@mag.linz.at** | Yes — data.gv.at dataset metadata |

Dataset confirms: CC-BY-4.0 (OGD Austria-wide, per yesterday's research), an XML distribution
("Alle Termine") and a "Erklärung der Schnittstellen" (interface explainer doc), last updated
14 June 2023. The public `export_info.php` endpoint on linztermine.at itself returns HTTP 403 —
i.e. it exists but is access-gated, confirming the ask below is necessary rather than a formality.

**Send to:** `open.commons@linz.at`, cc `komm@mag.linz.at` — the first is the listed data owner
contact, the second is the named team (Kommunikation und Marketing / Onlineservices, who run
linztermine.at itself per the "KOMM" tag on the dataset).

### The ask

API access to the `eventExport` XML interface, so Okolo can pull Linz's official event calendar
programmatically instead of scraping the monthly `/linz-erleben/` HTML pages (which 404 until a
month is published — a known reliability problem). Every event stays linked back to
linztermine.at as the source.

### Draft email

```
An: open.commons@linz.at
Cc: komm@mag.linz.at
Betreff: Zugang zur Linztermine eventExport-Schnittstelle (Anfrage Okolo)

Sehr geehrte Damen und Herren,

mein Name ist Georgi Kostov, ich baue Okolo (okolo.events) — eine Familien-Eventkarte für
den Großraum Linz. Okolo zeigt Veranstaltungen mit direkter Verlinkung zur Quelle, ohne
Inhalte zu kopieren.

Auf data.gv.at ist zum Datensatz "Linztermine – Übersicht über Veranstaltungen" eine
eventExport-XML-Schnittstelle dokumentiert. Der Endpunkt (export_info.php) ist derzeit mit
HTTP 403 gesperrt. Aktuell beziehen wir Linztermine-Veranstaltungen über eine monatliche
HTML-Seite, was fehleranfällig ist (Seiten sind bis zur Veröffentlichung nicht erreichbar).

Ich möchte Sie bitten, uns Zugang zu dieser XML-Schnittstelle zu gewähren. Jede
übernommene Veranstaltung würde mit Titel, Datum und Ort dargestellt und direkt auf
linztermine.at zurückverlinkt — Okolo ersetzt Ihre Seite nicht, sondern lenkt Familien
zu Ihren Original-Einträgen.

Für Linz bedeutet das zusätzliche Sichtbarkeit Ihrer Veranstaltungen über eine
kartenbasierte, familienorientierte Ansicht sowie über KI-Assistenten, die auf
strukturierte Eventdaten zugreifen — ohne zusätzlichen Aufwand für Ihr Team.

Gerne erläutere ich das Projekt in einem kurzen Telefonat oder Video-Call.

Mit freundlichen Grüßen
Georgi Kostov
Okolo — okolo.events
```

(122 words body, excl. subject/signature.)

---

## 2. Österreich Werbung — ContentDB / LTO API key

### Contact (verified)

Confirmed via the **live api.austria.info page** (fetched directly), which matches yesterday's
research doc:

| Contact | Email | Verified |
|---|---|---|
| General API access request address | **api@austria.info** | Yes — listed on api.austria.info as the contact for data-interface issues |
| Named contact for new applications | **martin.reichhart@austria.info** | Yes — api.austria.info explicitly instructs new applicants to email this address with their intended use case |

**Send to:** `martin.reichhart@austria.info`, cc `api@austria.info` — the page explicitly directs
new-application requests to the named contact, with the general address as the documented
fallback.

Confirmed on the same page: open-data tier is CC-BY-4.0 ("Datensatz zu Österreichs touristischer
Infrastruktur ist unter der Creative Commons-Lizenz CC-BY 4.0 verfügbar"), covering POI,
accommodations, routes, **events**, and gastronomy, updated weekly for the open-data tier.
API-tier terms were not separately published in what we could fetch — worth asking directly in
the email, which the draft below does.

### The ask

API-tier access (not just the weekly open-data extract) to the Events category of the
ContentDB/LTO interface, and explicit confirmation that CC-BY-4.0 covers displaying the data on
an interactive map with attribution/linkback.

### Draft email

```
An: martin.reichhart@austria.info
Cc: api@austria.info
Betreff: API-Zugang ContentDB (Events) — Anfrage Okolo

Sehr geehrter Herr Reichhart,

mein Name ist Georgi Kostov, ich baue Okolo (okolo.events) — eine familienorientierte
Eventkarte, aktuell mit Fokus auf den Großraum Linz. Okolo zeigt Veranstaltungsfakten
(Titel, Datum, Ort) mit direkter Verlinkung zur Originalquelle.

Ich habe die ContentDB-Dokumentation unter api.austria.info geprüft und würde gerne
API-Zugang zur Kategorie "Veranstaltungen" beantragen, um aktuelle Events aus
Oberösterreich strukturiert und regelmäßig zu beziehen, statt einzelne Seiten zu
crawlen.

Kernfunktion der Anwendung: eine interaktive Karte, auf der Familien Veranstaltungen in
ihrer Umgebung finden — gefiltert nach Datum, Alter, drinnen/draußen, kostenlos u. Ä. Jede Veranstaltung bleibt mit Quelle und Verlinkung zur ursprünglichen Seite
gekennzeichnet.

Zusätzlich wollte ich nachfragen, ob die CC-BY-4.0-Bedingungen des Open-Data-Tiers auch
für die kartenbasierte Darstellung mit Attribution gelten, oder ob für den API-Tier
gesonderte Bedingungen bestehen.

Für Ihre Veranstalter bedeutet das zusätzliche Reichweite über eine kartenbasierte
Ansicht und über KI-Assistenten, ohne zusätzlichen Aufwand auf Ihrer Seite.

Gerne stelle ich das Projekt in einem kurzen Call vor.

Mit freundlichen Grüßen
Georgi Kostov
Okolo — okolo.events
```

(138 words body.)

---

## 3. Familienkarte / Land OÖ — event-feed cooperation

### Contact (verified, with one caveat)

Pulled from the **Impressum and Kontakt/Ansprechpartner pages of familienkarte.at** (fetched
directly):

| Role | Name | Email | Verified |
|---|---|---|---|
| Publisher / media owner, general dept. inbox | Familienreferat des Landes Oberösterreich | **familienreferat@ooe.gv.at** | Yes — Impressum, familienkarte.at |
| Head of Familienreferat | Renate Katzmayr | renate.katzmayr@ooe.gv.at | Yes — public staff listing (Ansprechpartner page) |
| Named contact — "Website & Apps" | **Anna Jachs** | **anna.jachs@ooe.gv.at** | Yes (address listed) / role fit **unverified** — page lists her as responsible for Website & Apps, which is the natural fit for a feed/API cooperation ask, but we have no independent confirmation she personally handles third-party data-cooperation requests. |

**Send to:** `familienreferat@ooe.gv.at` (the official department channel — appropriate for a
formal cooperation ask), cc `anna.jachs@ooe.gv.at` since her listed remit (Website & Apps) is the
best-fit internal routing and increases the odds of a fast, correct handoff. Flagged clearly:
the cc is a judgment call based on her title, not a confirmed "this is the right person."

### The ask

This is the most delicate of the four — Okolo already shows Familienkarte's public family events
with linkback (per CLAUDE.md's facts-with-linkback rule), so this isn't a request for permission
to start; it's an offer to formalize and improve what's already the plan: propose either a
structured feed (RSS/JSON/API — whatever they already have or would be willing to expose) or,
failing that, explicit blessing for the current linkback approach, framed as a value exchange
(their events get an additional discovery surface at zero cost to them).

### Draft email

```
An: familienreferat@ooe.gv.at
Cc: anna.jachs@ooe.gv.at
Betreff: Kooperation Veranstaltungsdaten OÖ Familienkarte — Anfrage Okolo

Sehr geehrte Damen und Herren,

mein Name ist Georgi Kostov, ich baue Okolo (okolo.events) — eine Eventkarte für
Familien im Großraum Linz. Okolo zeigt öffentlich zugängliche Familienveranstaltungen
mit Titel, Datum und Ort, jeweils direkt zur Originalseite verlinkt — darunter auch
Veranstaltungen, die auf familienkarte.at gelistet sind.

Ich möchte anfragen, ob eine engere Kooperation für Sie interessant wäre: entweder ein
strukturierter Veranstaltungs-Feed (RSS, JSON oder eine bestehende Schnittstelle), den
wir direkt einbinden könnten, oder — falls das aktuell nicht vorgesehen ist — Ihre
Bestätigung, dass die bestehende Darstellung mit Quellenverlinkung für Sie passt.

Für die OÖ Familienkarte bedeutet das zusätzliche Sichtbarkeit Ihrer Veranstaltungen auf
einer kartenbasierten, familienorientierten Plattform sowie bessere Auffindbarkeit über
Google und KI-Assistenten — ohne zusätzlichen Aufwand für Ihr Team, da wir ausschließlich
Fakten übernehmen und immer zu Ihrer Seite zurückverlinken.

Gerne erläutere ich das Projekt und mögliche Formen der Zusammenarbeit in einem kurzen
Gespräch.

Mit freundlichen Grüßen
Georgi Kostov
Okolo — okolo.events
```

(145 words body.)

---

## 4. tips.at — content partnership (lowest priority, value-exchange framing)

### Contact (verified)

Pulled from the **tips.at Kontakt page** directly:

| Role | Name | Email | Verified |
|---|---|---|---|
| Chefredaktion (Editor-in-Chief) | Alexandra Mittermayr, MBA | **a.mittermayr@tips.at** | Yes — tips.at/kontakt |
| Redaktion Linz (regional editorial) | — | **redaktion-linz@tips.at** | Yes — tips.at/kontakt |
| Key-Account-Management (sales/partnerships) | Lisa Maria Bichler | l.bichler@tips.at | Yes — tips.at/kontakt |

**Send to:** `a.mittermayr@tips.at`, cc `redaktion-linz@tips.at` — this is a content-partnership
pitch, so the editor-in-chief is the right entry point rather than sales (Key-Account-Management
is commercial ad sales, a different conversation). If Mittermayr wants to route it to Bichler,
that's her call to make internally.

**Note on positioning:** tips.at is Regionalmedien Austria (part-owned by Moser Holding), a
commercial regional publisher — not a data source, a potential content partner. The draft is
framed as a value exchange (referral traffic to their event pages), not a data request, per
George's brief.

### The ask

Explore a lightweight content partnership: Okolo links to tips.at's regional event listings
(driving referral traffic to their site) in exchange for using their event listings as a
discovery source, with full attribution. Kept deliberately open-ended since this is exploratory,
not a specific technical ask like #1–3.

### Draft email

```
An: a.mittermayr@tips.at
Cc: redaktion-linz@tips.at
Betreff: Kooperationsanfrage: Veranstaltungshinweise Tips.at — Okolo

Sehr geehrte Frau Mittermayr,

mein Name ist Georgi Kostov, ich baue Okolo (okolo.events) — eine Eventkarte für
Familien im Großraum Linz, die Veranstaltungen aus verschiedenen Quellen mit direkter
Verlinkung zur Originalseite darstellt.

Tips.at ist für uns eine der relevantesten regionalen Quellen für Veranstaltungshinweise
in Oberösterreich. Ich möchte anfragen, ob eine Kooperation für Sie interessant wäre: Wir
würden Veranstaltungen aus Ihrer Berichterstattung auf unserer Karte mit Titel, Datum und
Ort zeigen und dabei jeden Eintrag direkt zu Ihrem Artikel auf tips.at verlinken — das
bringt Ihnen zusätzliche Leser-Zugriffe von einer familienorientierten Zielgruppe, die
Sie sonst nicht erreichen.

Denkbar wäre auch eine engere Anbindung, etwa über einen Feed Ihrer
Veranstaltungsmeldungen, falls das für Sie von Interesse ist.

Über ein kurzes Gespräch, ob und in welcher Form das für Tips.at passt, würde ich mich
freuen.

Mit freundlichen Grüßen
Georgi Kostov
Okolo — okolo.events
```

(126 words body.)

---

## Summary table

| # | Target | Primary contact | Verified? | Cc | Notes |
|---|---|---|---|---|---|
| 1 | Stadt Linz / Linztermine | open.commons@linz.at | **Yes** — data.gv.at dataset metadata | komm@mag.linz.at (also verified) | Both emails pulled live from a JS-gated "reveal email" control on the dataset page, not guessed. |
| 2 | Österreich Werbung ContentDB | martin.reichhart@austria.info | **Yes** — api.austria.info, explicit instruction to email this address | api@austria.info (also verified) | Matches yesterday's research doc; API-tier license terms not separately published, so the email asks directly. |
| 3 | Familienkarte / Land OÖ | familienreferat@ooe.gv.at | **Yes** — Impressum | anna.jachs@ooe.gv.at (email verified, "right person" role fit **unverified**) | Delicate framing: we already show their events, so this formalizes rather than requests permission to start. |
| 4 | tips.at | a.mittermayr@tips.at | **Yes** — tips.at/kontakt | redaktion-linz@tips.at (also verified) | Commercial publisher — pitched as value exchange (referral traffic), not a data ask. Lowest priority per brief. |

## Surprises worth flagging to George

- **Linztermine's contact emails were harder to get than expected but ended up fully verified**:
  data.gv.at hides them behind a client-side "E-Mail anzeigen" button (anti-scraping), which
  defeated a plain WebFetch — had to render the page and trigger the reveal to get
  `open.commons@linz.at` and `komm@mag.linz.at`. Worth knowing this dataset was re-added to
  data.gv.at on 26 August 2025 and last touched 16 September 2025 (metadata refresh, not
  necessarily an interface change) even though the underlying dataset content says "Aktualisiert:
  14. Juni 2023" — the catalog entry itself is actively maintained, which is a mildly encouraging
  signal that someone is still watching this listing.
- **Familienkarte is the one email that needs George's sign-off on framing before sending** — it's
  the only target where Okolo is already using their data today. The draft is written to read as
  a cooperation offer, not a disclosure, but George should read it once given CLAUDE.md's
  data-partnership-decisions-are-his-call rule.
- **tips.at has no listed "partnerships" or "business development" role** — only editorial and ad
  sales. The draft goes to editorial (Mittermayr) since this is a content/linkback pitch, not an
  ad buy, but flag that if she doesn't reply, Key-Account-Management (l.bichler@tips.at) is the
  fallback for a more commercially-framed version of the same ask.

File delivered: [briefs/outreach-emails-de.md](../briefs/outreach-emails-de.md)
