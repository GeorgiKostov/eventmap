# Weekly Automation Pipeline (The Thursday Flow)

> Status: **SHIPPED 2026-07-14** · Owner: Architect agent
> This spec defines the automation pipeline for the weekly Okolo growth engine. We automate the *creation* of assets, but keep *distribution* (social posting) manual until proven.
>
> **What exists now** (the strategy around it: `docs/strategy/growth-system.md`):
> | Piece | Where |
> |---|---|
> | City/area channel registry (10 cities, DE + BG) | `lib/city-channels.js` |
> | Top-5 weekend selection query | `lib/db.js` → `weekendPicks()` |
> | AI copy — subject, intro, one teaser per pick (Sonnet → Gemini → template) | `lib/extract.js` → `writeDigestCopy()` |
> | Digest assembly + frozen weekly snapshot + caption + email HTML | `lib/digest.js` |
> | Carousel cards, 1080×1350, Latin + Cyrillic | `GET /api/social/card?channel=&slide=` |
> | The desk (review, drop a pick, download cards, copy caption, send) | `/admin/thursday?token=<ADMIN_TOKEN>` |
> | CLI (`npm run digest -- --all --cards ./out --send`) | `scripts/weekly-digest.mjs` |
> | Thursday cron — **prepares only, never posts, never sends** | `.github/workflows/weekly-digest.yml` |
>
> Deviations from the plan below, and why: the "Top 5" is a **frozen snapshot** per city per weekend
> (so the cards, the caption and the email can never disagree, and a card request can't re-trigger a
> paid AI call); the ZIP download became per-card links (a ZIP needs a bundler dep for six files you
> right-click anyway); and the send button refuses with a 503 when SMTP is unset rather than reporting
> a success that never left the building.

## 1. Goal & Philosophy
The growth strategy relies on a weekly rhythm: every Thursday afternoon, we tell parents what the best 5 family events are in Linz for the upcoming weekend. 

**The Rule:** We automate asset generation (images, text, email drafting) to save time, but we **do not automate social posting**. Auto-posting bots get banned from local Facebook/WhatsApp groups. You must post the generated assets organically to build trust.

## 2. Core Components to Build

### A. The "Top 5" Selection Query
A backend utility that queries Supabase for the best events this weekend.
- **Filters:** `kind = 'event'`, `starts_at` between Friday 12:00 and Sunday 23:59 (Vienna time).
- **Location:** Within the Linz radius.
- **Tags:** Must be family-friendly.
- **Ranking:** Prioritize `is_free=true`, high-quality venues, and community-submitted events.
- **Output:** An array of 5 event objects.

### B. Social Asset Generator (`next/og`)
We will reuse Next.js's built-in ImageResponse (`next/og`) to generate beautiful 1080x1350 (Instagram Portrait) PNG cards dynamically from our data. No Photoshop needed.
- **Endpoint:** `GET /api/admin/social-cards?events=[id1,id2,id3,id4,id5]`
- **Design:** A carousel. 
  - Slide 1 (Cover): "Familien-Wochenende in Linz [Dates]" with Okolo branding.
  - Slides 2-6: One card per event featuring the category icon, title, day/time, venue, and a "gratis" badge if applicable.
- **Caption Generator:** A function that outputs a copy-pasteable caption summarizing the 5 events with relevant local hashtags (`#linzmitkindern`, `#wochenende`).

### C. Newsletter Generator
A script that takes the same "Top 5" array and injects it into a clean, branded HTML email template.
- **Integration:** Connects to an email provider (Resend, Mailgun, or Nodemailer).
- **Drafting:** The system drafts the email but **does not send it automatically**. It waits for manual approval.

### D. The Admin Dashboard (`/admin/thursday`)
A hidden, password-protected route in the Next.js app where you manage this workflow.
- **View:** Shows the 5 selected events (with options to swap one out if the algorithm picked a bad one).
- **Action 1 (Social):** A "Download Social Assets" button that gives you a ZIP file of the 6 PNG cards and copies the caption to your clipboard.
- **Action 2 (Newsletter):** A preview of the HTML email and a giant "Approve & Send Newsletter" button.

## 3. The Thursday Workflow (George's Job)

Once built, your Thursday afternoon will look like this:

1. **15:00:** Open `okolo.events/admin/thursday`.
2. **15:01:** Review the 5 auto-selected events. Swap any if needed.
3. **15:02:** Click "Download Social Assets". The 6 PNGs and caption are on your phone/laptop.
4. **15:03:** Open Instagram, select the 6 images, paste the caption, and post to `okolo.linz`. Share to the Facebook Page.
5. **15:05:** Open WhatsApp/Facebook Groups, write a human message ("Hey everyone, here are the 5 best things for the kids this weekend..."), and drop the link.
6. **15:10:** Click "Approve & Send Newsletter" on the admin dashboard.

**Total time:** 10 minutes.
**Impact:** Reaches the newsletter list, Instagram followers, and local community groups simultaneously with zero manual design work.

## 4. Next Steps for Implementation
When we are ready to build this, we will execute in this order:
1. Build the Top 5 Supabase query.
2. Build the `/admin/thursday` UI (behind a basic auth guard).
3. Build the `next/og` carousel generator endpoint.
4. Wire up the email drafting step.
