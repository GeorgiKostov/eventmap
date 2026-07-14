# The Okolo growth system

Status: **built 2026-07-14** (the machine), **unproven** (the motion). Owner: George.
Companion to `docs/strategy/growth-and-social.md` (channel research, pricing anchors, partnerships)
and `docs/ops/weekly-automation.md` (the Thursday runbook). This doc is the *operating system*: what
the loop is, what actually limits it, what we measure, and when a city earns the next city.

---

## 1. The one sentence

**Every Thursday, each city channel publishes the same five family picks — as a carousel, as a
caption, and as an email — and every one of them links back to our map.** One selection query feeds
all three surfaces, so the work of "doing marketing" collapses into reviewing five events and
pressing two buttons.

That is the whole engine. Everything below is either feeding it or measuring it.

## 2. Where we actually are (be honest about the bottleneck)

| Asset | State |
|---|---|
| Supply (events) | **22k+ events, 1,500+ sources, daily crawl.** Solved, and far ahead of demand. |
| Product (map) | Live, viewport-native, fast. Good enough for the test. |
| Assets (cards/email/caption) | **Built today.** Zero manual design work per week. |
| **Audience** | **1 subscriber — and it isn't confirmed.** Zero followers. Zero groups seeded. |

The bottleneck is not data and not product. **It is distribution, and it has been for a while.** The
entire value of what got built today is that it removes the *excuse* — producing a week's assets now
costs ten minutes, so the only remaining input is George showing up in the places parents already are.

**Corollary that should hurt:** if the Linz test is run without seeding an audience first, it will
measure nothing. A retention metric over zero users is not a small signal, it is no signal. Audience
seeding is not "marketing to do later" — it is *step one of the validation test*.

## 3. The loop

```
crawl (daily, automatic)
   ↓
weekend picks query (Thursday, automatic)  ← lib/db.js weekendPicks
   ↓
AI writes subject/intro/teasers (Sonnet)   ← lib/extract.js writeDigestCopy
   ↓
frozen snapshot for the weekend            ← one pick set; cards, caption and email cannot disagree
   ↓
George reviews at /admin/thursday (10 min)
   ├── downloads 6 cards → posts to okolo.<city> IG + FB          [manual, on purpose]
   ├── copies caption → parent FB/WhatsApp groups                 [manual, on purpose]
   └── presses Send → newsletter to that city's confirmed list
   ↓
every asset links back to the map with ?utm_campaign=weekend-<friday>
   ↓
new visitors → map → newsletter signup → next Thursday they get it by email
```

The loop closes at the newsletter: social reach is rented, the email list is owned. **Social's job is
to feed the list**, not to be the audience.

### Why posting and sending stay manual

Both are deliberate, and both are cheap to defend:

- **Auto-posting gets you banned.** The local FB/WhatsApp parent groups are the single highest-value
  channel we have, and every one of them bans bot promo. A human dropping a genuinely useful weekly
  list is welcome; a bot posting the same thing is removed and the channel is burned permanently.
- **Auto-sending mails mistakes.** The newsletter is our highest-trust surface, going to parents,
  about where they will physically take their children. An unreviewed digest that ships a cancelled
  event is a trust loss you don't get to undo (hard rule 5 exists for exactly this).

The cron therefore *prepares* and emails George that the desk is ready. It never posts and never sends.
Revisit auto-posting via the Graph API only after ~4 weeks of manual posting proves the motion —
never before.

## 4. Channels

`lib/city-channels.js` is the registry — adding a city is adding a row (name, centre, radius, language,
hashtags). Ten are defined; **only Linz is live.** The rest exist so the second city costs an afternoon,
not a rebuild.

| Tier | Cities | Language |
|---|---|---|
| **Now** | Linz | DE |
| Next (after Linz retains) | Wien, Graz | DE |
| Later | Salzburg, Innsbruck, Stuttgart | DE |
| Bulgaria track | София, Пловдив, Варна, Бургас | BG |

**The gate to open a new city:** Linz must hit the retention bar in the four-weekend test *first*.
Two cities at 20% retention is not twice as good as one — it is the same failure, twice, with double
the weekly work. Resist this specifically; a city-named handle is cheap to create and expensive to
abandon.

**Bulgaria is a different game, not a translated one.** BG families discover events on Facebook
itself (~69% of the population on FB), so the BG channels lead with an FB *Page* and group seeding,
with the map as the destination — not an app-first motion with FB as an afterthought. The digest
machinery already speaks Bulgarian (Cyrillic cards, BG dates, BG copy) so this costs nothing to hold.

## 5. Getting the first 100 subscribers (the actual work)

Ranked by cost-per-subscriber, cheapest first. This is the part no code can do.

1. **The map itself.** Every visitor is a signup opportunity. The subscribe surface exists; make sure
   it asks at the moment the value is obvious (after someone finds something to do), not on arrival.
2. **Parent FB groups in Linz/OÖ** ("Linz Eltern", "Linz mit Kindern", district groups). Read each
   group's promo rules first. Lead with the value — answer the "was ist los am Wochenende?" question
   that gets asked in these groups every single week, *with the actual list*, and let the link speak.
   Per-group UTM so we learn which group is worth the effort.
3. **Kindergarten / Volksschule newsletters + playground QR posters.** The QR is the only realistic
   way into WhatsApp class groups, which are where Austrian parents actually coordinate and which you
   cannot join cold. Physical → digital, in the exact context of use.
4. **OÖ Familienkarte** — a distribution partnership (their audience, our content). Highest ceiling,
   longest lead time. The outreach draft is already written (`briefs/outreach-emails-de.md`).
5. **Local press / Tips OÖ** — a launch story is free; their ad rates are not.

Target before the four-weekend test starts: **a few hundred people who will notice if the newsletter
doesn't arrive.** That is the smallest audience that produces a readable retention number.

## 6. What we measure

The growth metrics and the validation metrics are the same numbers — that is the point of building the
engine and the test as one motion.

| Metric | Where | Why it's the one that matters |
|---|---|---|
| Newsletter **open + click** rate | send logs + `utm_medium=email` in PostHog | Is the digest worth opening? Below ~25% open, the picks are wrong. |
| **Weekly return rate** | PostHog, returning visitors ÷ subscribers | The go/no-go metric. Do people come back without being pushed? |
| **Interest taps** per digest event | `reactions` table | The only intent-to-attend signal we have. |
| Signups per channel | `subscribers.source` + per-group UTM | Tells you which group/poster/partner is worth repeating. |
| **Coverage complaints** | data-quality reports | If parents report events the aggregators had and we missed, supply isn't done after all. |

Everything already carries `?utm_source=okolo&utm_medium=email|ig&utm_campaign=weekend-<friday>`, so
attribution needs no new plumbing.

## 7. The weekly calendar

| When | What | Who |
|---|---|---|
| Daily 04:00 UTC | Crawl refreshes every source | cron |
| **Thu 09:00 UTC** | Picks frozen + AI copy written + "desk is ready" mail | cron (`weekly-digest.yml`) |
| **Thu ~16:00 Vienna** | Review → download carousel → post IG/FB → drop in groups → Send | **George, ~10 min** |
| Fri–Sun | Optional Story: "heute in Linz" (1–3 time-sensitive picks) | George, optional |
| Mon | Read the numbers from §6. One change per week, not five. | George |

## 8. Monetization (don't start yet)

The newsletter sponsor slot is the first surface (€50–150/issue), promoted pins next (€20–50/event/week)
— full ladder and Austrian price anchors in `growth-and-social.md` §6. **Do not sell before we can quote
real reach**, and the paid tier is legally gated on the labelling work in
`docs/decisions/2026-07-12-paid-placement-compliance.md` (per-listing "Anzeige", payer identity,
ranking disclosure). Selling into a 40-person list burns the advertiser relationship we'd want at 4,000.

## 9. Rules the system will not break

1. **Facts + linkback, never copy.** Cards are our own template rendered from our own data; teasers are
   the model rephrasing our own descriptions. No source poster, no source prose (EU DB right / UrhG).
2. **The AI writes prose, never facts.** `writeDigestCopy` may only rephrase the fields it is handed; a
   time, price, age or venue that isn't in the DB row must not appear on a card. Verified: every teaser
   traced back to its DB description.
3. **No newsletter without double opt-in**, and every send carries RFC-8058 one-click unsubscribe.
4. **The newsletter must render with zero AI.** If the model call fails, the template writes the copy
   and the digest still ships. A growth loop that breaks when a provider 429s is not a loop.
5. **Never auto-post, never auto-send.** §3.

## 10. Open decisions for George

- **Copy model:** `ANTHROPIC_API_KEY` is not set anywhere yet, so the copy currently falls back to
  Gemini Flash. Sonnet (your call, and the better writer) needs the key on Vercel + as a GH Actions
  secret. Until then the desk will honestly show `copy: gemini-2.5-flash`.
- **The community bonus:** the ranking gives user-submitted events +2 (they're our differentiator).
  That is also what let a test row headline the first digest. Keep the bonus and rely on the Drop
  button, or gate community events on a quality check? Currently: keep + Drop.
- **Grandfathered subscribers:** the one existing signup predates double opt-in and is unconfirmed, so
  it receives nothing. Re-confirm it, or drop it?
- **Family = filter or default lens?** Still open, and it decides the handle bio and the digest framing.
