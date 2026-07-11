# 2026-07-11 — The middle layer: trade distribution for supply

Status: strategy (a sharpening of design-doc §8, not a build task) · Owner: Architect
George's framing: *"the main in middle serving as local apps and sites SEO + AI, routing traffic to
them — in exchange they give me events."*

## The idea in one line

Umkreis sits **between** the events and everyone who wants to find them. Downstream we hand events to
families (our map), to Google (schema.org JSON-LD), and to AI assistants (MCP/API). Upstream we give
organizers, venues, and local sites the one thing they cannot build themselves — **SEO + AI
discoverability and the referral traffic that comes with it** — and in exchange they let us index and
enrich their events. Distribution is the currency we pay for supply.

## Why this is the right sharpening (and genuinely new)

- **It inverts the cost-of-acquisition trap.** Malkin's post-mortem: suppliers won't add events to a
  small platform because there's no audience yet. Our consideration isn't audience size (we don't have
  it yet) — it's a *technical capability* we possess on day one: correct JSON-LD, a sitemap, `llms.txt`,
  and a live MCP server. A Gemeinde or a small venue literally cannot produce those. So we can offer
  real value before we're big.
- **It's already baked into our hard rule.** "Facts + linkback, never copy" means every event carries
  `source_url` and drives traffic back. The linkback *is* the consideration in the barter — we were
  always going to do it; now it's framed as the deal, and it stays legally clean (EU database right /
  UrhG §76c untouched).
- **It answers "who keeps the data fresh?"** Organizers with a self-interest in reach become supply
  partners who maintain their own listings — the tastemaker/curation gap from the Malkin analysis.
- **It's a cooperative posture toward Familienkarte**, not a head-on fight. As a distribution layer we
  can carry *their* events with linkback rather than competing destination-vs-destination.

## Two honest guardrails (this is where it can fail)

1. **The traffic is back-loaded — value to suppliers still depends on us owning demand first.** On
   week one we route almost no traffic, so "we'll send you visitors" is weak; the honest pitch is
   "Google/AI visibility you can't build yourself, plus traffic as our audience grows." The barter's
   full value unlocks only after we own regional density — which loops straight back to the
   **four-weekend Linz test** as the thing that gates everything.

2. **Do the distribution job *too* well and we make ourselves skippable.** If our JSON-LD is perfect,
   Google can render the event and the AI can answer with the `source_url` — and the user never visits
   Umkreis. This is the central tension of any middle-layer play: the plumbing alone is not a moat.
   **Defensibility must come from what the bare source page can't replicate** — aggregation across all
   sources, the family lens (age / indoor / stroller / weekend), the map, and a retained audience with
   reminders. The middle-layer strategy only works bolted onto an *owned, retained demand surface*, not
   as pure pass-through pipes.

## Segmentation — where the barter actually bites

- **Civic micro-events** (Feuerwehrfest, kindergarten, parish): we get these by **crawling** — no
  barter needed, and the organizer mostly cares about local word-of-mouth, not our SEO. Distribution is
  marginal to them.
- **Commercial / semi-commercial long tail** (venues, festivals, paid workshops, family cafés, tourism
  offices): these *want* reach and bookings, so SEO + AI visibility + referral traffic is real value.
  **This is the segment the trade-traffic-for-supply pitch is built for.**

So: **crawling is the coverage bootstrap; the barter is the enrichment/authority upgrade** on top of
it — the incentive that makes an organizer *claim* and maintain a listing rather than leave it as
scraped facts.

## The concrete mechanism: "Claim your event"

The product primitive that makes the barter real, single-organizer scale:

1. Every crawled event shows an affordance: *"Is this yours? Claim it."*
2. Organizer verifies → gets a light dashboard: correct/enrich the listing (exact price, ticket link,
   capacity, updates), see referral stats, grab an **embeddable widget** and a badge
   *"Found on Google & AI via Umkreis."*
3. That is the RiS-Kommunal / GEM2GO write-integration in miniature. The vendor deal is the same loop
   at scale — their "publish event" button feeds us directly, no double entry, no scraping.

## Monetization (post-density only — do not build now)

Once we are the rails and own a region: (a) premium organizer tools — but featured/sponsored placement
conflicts with trust (Malkin/UpOut warning), handle carefully; (b) selling the clean, fresh, legally
clean structured feed to AI companies — viable *only* after density; (c) municipal / CMS-vendor SaaS.
None of this is a validation-phase concern.

## Decision / stance

Adopt "trade distribution for supply" as the explicit framing of the B2B2C middle layer, with the two
guardrails above treated as first-class: (1) it does not replace winning Linz demand — it depends on
it; (2) it is only defensible when paired with an owned, retained family audience + aggregation the raw
source lacks. Nearest build expression is a **"claim your event"** flow, but that is **post-validation**
— the Linz coverage/retention test still comes first and still gates everything.

## Consequences

- Design-doc §8 sharpened with this framing; §11 gains the self-disintermediation risk.
- Backlog gains: "claim your event" flow; a one-page organizer-facing pitch for the commercial segment.
- No change to phase discipline: crawl remains the bootstrap; the Linz test remains the gate.
