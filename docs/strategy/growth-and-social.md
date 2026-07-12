# Growth, social & monetization strategy

Status: draft for the Linz validation phase (2026-07). Owner: George. Companion to
`docs/design/design-doc.md` (product) and `docs/decisions/2026-07-11-middle-layer-strategy.md`
(distribution-for-supply). Everything here is scoped to *what the four-weekend Linz
coverage/retention test needs* — one city, families-first — not a national rollout.

Pricing/benchmark figures below are researched anchors (sources inline), not commitments. Nothing
is charged until we can quote real Linz reach.

---

## 1. The shape of the plan

The two closest comparables both grew **newsletter-first, one city at a time, with a city-named
social handle as the engine** — Rausgegangen went from a 30-person email list to 200k users city by
city ([source](https://bacb.de/en/perseverance-leads-to-success-an-interview-with-our-portfolio-startup-rausgegangen/)),
Nebenan.de unlocked neighborhood-by-neighborhood on critical mass. That is also exactly what our
validation test measures (weekly return rate + coverage). So the growth engine and the validation
gate are the same motion:

1. **Weekly family newsletter** for Linz (the retention loop we already half-built) — see §5.
2. **`okolo.linz` on Instagram + an Okolo Linz Facebook page** posting the same weekly picks — §2.
3. **Seed into where Linz parents already coordinate**: parent FB/WhatsApp groups, kindergarten/
   school newsletters, playground QR posters — §3.
4. **Piggyback OÖ Familienkarte's audience** (co-branding + their reach) — §4 / §6.

Bulgaria is deliberately different: families there discover events through **Facebook events and
groups** (4.6M FB users, ~69% of the population — [DataReportal](https://datareportal.com/reports/digital-2026-bulgaria)),
so a BG launch is FB-group-native from day one, not app-first (see memory `bg-facebook-events`).

---

## 2. Social posting flow — `okolo.linz` (Instagram + Facebook)

**Goal:** turn our own event data into a repeatable weekly post with near-zero manual effort, driving
traffic back to the map. City-scoped handle so it reads as *local*, and so the model copies cleanly
to the next city (`okolo.graz`, …) after Linz proves out.

### Handles & positioning
- Instagram: **`okolo.linz`**. Facebook: **Okolo Linz** Page. Bio: "Was ist los rund um Linz —
  familienfreundliche Events & Orte. Jede Woche neu. → okolo.events" + link-in-bio to the map
  (pre-filtered to Linz + this weekend).
- Voice: helpful local curator, not a brand megaphone. German first (Linz), same warmth as the app.

### Weekly cadence
- **Thursday ~16:00**: "Familien-Wochenende in Linz" — the anchor post (carousel of 4–6 picks).
- **Optional mid-week Story**: "Heute/Morgen in Linz" — 1–3 time-sensitive picks, link sticker.
- **Ad hoc**: a standout single event (festival, one-off) as a single post when worth it.

### Content pipeline (this is the "based on our content" part)
1. **Select**: query our own API/DB — `kind=event`, family-tagged, within Linz radius, `starts_at`
   this Fri–Sun, ranked (family fit, is_free, venue quality). Take top 4–6. Pure facts we already hold.
2. **Render cards from data, not scraped posters.** Reuse the `next/og` `ImageResponse` path already
   in `app/opengraph-image.js` to render one branded card per event at **1080×1350** (IG portrait):
   category icon + colour, title, day/time, venue, "gratis" badge, Okolo mark + `okolo.events`. A
   cover card ("Familien-Wochenende · 11.–13. Juli") leads the carousel. This keeps us inside the
   hard rules — **our own descriptions and our own templated card art, never the source's prose or
   images** (EU DB right / UrhG). Proposed build: `GET /api/social/weekend-card?event=<id>` (or a
   batch endpoint returning the whole carousel) → PNGs, plus a caption string.
3. **Caption**: short intro + a plain list (title — day/time — venue), each with the linkback framing
   ("alle Infos & Karte: okolo.events"), 8–12 local hashtags (#linz #linzmitkindern #oö #familienausflug …).
4. **Post**: manual at first (download the PNGs + copy the caption — a one-tap flow for George).
   Automate later via the **Instagram Graph API / FB Pages API** once the handle is a real Business
   account and the motion is proven. Don't build API automation before manual posting shows it's worth it.
5. **Measure**: link-in-bio and Story links carry `?utm_source=ig&utm_campaign=weekend`; watch
   referral sessions in PostHog + follower growth. This is a coverage/retention signal for the test.

### Guardrails
- Facts + linkback only; never repost a source's poster image or copy its text.
- We link to **our** event pages / map, not the original source, in social (drives our retained audience).
- Don't auto-create Facebook *Events* from crawled data (attribution/ToS murk) — post links/cards instead.

### Build tasks this implies
- Weekend-picks selection query (reuse existing filters).
- `next/og` card template(s) at 1080×1350 + cover card; a card/batch endpoint.
- A tiny "generate this week's carousel" script George runs Thursday (PNGs + caption to a folder).
- (Later) Graph API auto-post + a scheduler.

---

## 3. Where Linz parents already are — groups to seed into

**These are candidate targets and a method, NOT verified active groups — verification is its own todo
(a live pass: join, read rules, gauge activity).** Most parent groups ban overt promo, so the play is
*be a useful weekly resource*, or partner with the admin — not spam.

- **Facebook — Linz/OÖ parent & family groups**: search patterns "Linz Eltern", "Mamis/Papis Linz",
  "Linz mit Kindern", "Familien Linz/Urfahr/OÖ", "Flohmarkt/Second-hand Kinder Linz" (adjacent
  audience). Also Linz district & "Was ist los in Linz" community groups.
- **Bulgarian community in Linz/Austria** (our secondary audience): "Българи в Линц/Австрия" groups —
  bridges the AT + BG story.
- **WhatsApp**: hard to join cold — reach these via **kindergarten/Volksschule class groups and
  neighborhood groups**, seeded by the **playground/kindergarten QR poster** ("scan → Events für
  Familien rund um Linz diese Woche"), not by joining directly.
- **Rules of engagement**: read each group's promo policy; lead with value (share the weekly picks
  where allowed, answer "what's on this weekend" questions), or DM admins offering the weekly list as
  free content / a co-brand. Track which group drove signups (per-group UTM or a landing note).
- **Bulgaria**: the large national BG event/parent FB groups are the primary channel there — evaluate
  Graph API / organizer submission / manual Page seeding per memory `bg-facebook-events` (never scrape).

---

## 4. User acquisition — channel summary

| Channel | Play | Evidence |
|---|---|---|
| Weekly newsletter | Retention loop + the asset advertisers pay for | Rausgegangen bootstrapped from an email list |
| `okolo.linz` IG/FB | City-named handle, weekly picks from our data | Rausgegangen's per-city IG = main engine |
| Parent FB/WhatsApp groups | Be a useful weekly resource; QR into class/neighborhood groups | Where AT parents coordinate (unbenchmarked) |
| OÖ Familienkarte | Get featured / listed → ~1,700-partner, family-household reach | [familienkarte.at](https://www.familienkarte.at/de/familienkarte/vorteilsgeber.html) |
| Local press / Tips OÖ | A launch story; cheaper than their ad rates | regional weekly, 15 editions |
| Playground/kindergarten QR posters | Physical→digital in the exact context | plausible, to test |

One city at a time. Prove Linz retention before spending on the next city.

---

## 5. Newsletter (retention loop + monetization hook)

The digest is "nice family events around Linz this weekend," by locality. Build state: subscribe with
locality + categories, **double opt-in + unsubscribe shipped** (2026-07-12). Remaining consent/legal
gaps are a tracked todo (record of consent, existing-subscriber grandfathering, List-Unsubscribe
header at send time, token expiry). The **sponsor slot** (one clearly-labelled "präsentiert von …"
placement per issue) is the first monetization surface — see §6.

---

## 6. Monetization — what to charge advertisers

Anchor: a Linz family venue already pays **Tips OÖ ~€649 for one 1/8-page print week**
([mediadaten](https://www.tips.at/service/mediadaten)); Rausgegangen sells promoted placement at
**€20 CPM** ([source](https://zentrale.events/dorf/faqs/articles/44001241183)); DACH newsletter
sponsorship runs **€20–50 CPM**. That frames a ladder deliberately cheaper than print:

| Product | Suggested price | Notes |
|---|---|---|
| Promoted pin (boosted, "Anzeige" label) | **€20–50 / event / week** | Needs the labelled business-tier UI (below) |
| Newsletter sponsor slot | **€50–150 / issue** | First surface; ~€20–50 CPM at a few-k list |
| Category / weekend sponsorship | **€150–400 / month** | Only once Linz reach is provable |

Who buys: indoor playgrounds, Kinder-cafés, museums/zoos, swim & workshop providers, festival
organizers — largely the Familienkarte partner set. **Do not sell before we have reach to quote**, and
the paid tier is gated on the compliance work already noted (`docs/decisions/2026-07-12-paid-placement-compliance.md`):
per-listing "Anzeige/Sponsored" labels, payer identity, ranking disclosure, advertiser terms.

---

## 7. Content partnerships (supply + reach)

Free-feed-for-linkback is the near-term model; our `source_url` rule already satisfies attribution.
Priority order:

1. **Stadt Linz / Linztermine `eventExport` XML** — CC-BY 4.0, event-granular, commercial reuse with
   citation; replaces the flaky HTML scrape ([terms](https://www.linztermine.at/nutzungsbedingungen)).
2. **OÖ Familienkarte** — a *distribution* partnership (audience + co-brand), not a data feed; our best B2C lever.
3. **Österreich Werbung ContentDB / open tier** (`api@austria.info`) — CC-BY 4.0, all-Austria events.
4. **TOURDATA (Oberösterreich Tourismus)** — central OÖ tourism DB, form-based integration; Linztermine already feeds it.

Drafts for the outreach emails are staged in `briefs/outreach-emails-de.md` — George sends. Lead with
Linztermine + Familienkarte.

---

## 8. Open questions
- Is "family-friendly" the default lens or a filter? (affects handle positioning + newsletter framing)
- Grandfather existing pre-double-opt-in subscribers, or require re-confirm? (see newsletter todo)
- When does manual social posting justify Graph API automation? (revisit after ~4 weeks of manual)
