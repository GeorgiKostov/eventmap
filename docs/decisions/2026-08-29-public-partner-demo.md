# Public partner demo — fictional by construction

**Decision:** Okolo may share `/partners` and `/partners/demo` with prospective organizers as a
public, non-indexed HTML showcase. `/partners` tells the partner story in a responsive web format
using optimized desktop/mobile screenshots linked to the demo; `/partners/demo` is the standalone
interactive product experience. The routes use only fictional event names, venues and timetable
entries, an original sample-festival mark, and a self-contained in-browser dataset. They do not query
or write the production event database.

The demo shows the proposed partner product without implying an existing relationship:

- a dedicated shareable festival URL;
- a custom festival identity on the map, event list and detail state;
- partner-only and day filters, with nearby Okolo events available for context;
- a clear fictional-demo disclosure and a contact action;
- privacy-safe interaction events using the existing analytics wrapper.

Both pages are `noindex, nofollow`: they are intended for direct outreach, not search acquisition.
HTML is the canonical showcase format because it is responsive, shareable, measurable and lets the
prospect open the product directly. The sales-page preview is deliberately static: it gives a fast,
stable first impression without making the pitch depend on an iframe, a second application render or
live map tiles. The preview and primary CTA both lead to the interactive demo. Do not create or
maintain PowerPoint/PDF versions unless George explicitly asks for a static export.
Real organizer names, logos, artwork or partnership language require written permission before
publication. Uncommissioned organizer-specific concepts, including the Ars Electronica concept,
remain local/private and are not part of the production build.

## What shipped

### Public interactive demo — `/partners/demo`

- Six fictional festival events across three days and six Linz-area sample venues, plus two fictional
  nearby Okolo events for city context.
- Original sample-festival identity applied to the map header, event list, pins and detail state.
- Festival-only and day filters, responsive desktop/mobile layouts, event detail selection and a
  direct partnership contact action.
- German, English and Bulgarian copy through the normal Okolo language system.
- Privacy-safe analytics for demo views, filters, event opens and contact actions.

### Public HTML showcase — `/partners`

- A responsive partner story explaining the distributed-festival use case, proposed benefits and
  three delivery layers: brand, programme and proof.
- Dedicated festival URL, custom identity, festival filter, schedule/highlights, mobile usability and
  measurable referrals presented as the partner feature set.
- Optimized WebP desktop/mobile product previews. The screenshot and the primary CTA open the full
  demo; no iframe is mounted on the sales page.
- Direct outreach CTAs and privacy-safe measurement for showcase views, demo opens and contact intent.

### Safety and publication boundaries

- The public routes contain no Ars Electronica name, logo, programme, artwork or claim of affiliation.
- The AEC-specific concept and screenshots remain local/private; `/aecfestival` returns 404 in
  production.
- Normal product and account routes retain CSP `frame-ancestors 'none'` and
  `X-Frame-Options: DENY`. Only the fictional partner routes are frameable for direct sharing in
  embedded browser panels.

## Improvements made after review

1. **HTML replaced PowerPoint.** The first static deck was retired because the product is best sold as
   a shareable, responsive web experience.
2. **Framing was scoped safely.** Global clickjacking hardening initially blocked the showcase in
   embedded browser panels and blocked its same-origin demo iframe. The exception was narrowed to the
   two fictional partner routes; security headers remain strict everywhere else.
3. **The sales hero became static-first.** Even after the iframe was repaired, it added map-tile,
   second-render and mobile-scroll dependencies to the first impression. Responsive screenshots now
   provide stable proof, with the interactive map one deliberate click away.

## Relevant commits and live verification

| Commit | Change |
|---|---|
| `5ba539b` | Added the fictional interactive festival demo, original sample mark, localization and tests. |
| `1664b1d` | Replaced the slide-deck approach with the responsive `/partners` HTML showcase. |
| `0bc0443` | Recorded production HTML-showcase verification. |
| `d4a2e01` | Scoped frame permissions to partner routes while retaining denial elsewhere. |
| `f875815` | Recorded the framing repair and production checks. |
| `a1c3e28` | Replaced the sales-page iframe with optimized responsive screenshots linked to the demo. |
| `59af4c8` | Recorded final static-preview production verification. |

Current production deployment `dpl_2WuGMUDPFwcjR5FvvJEAKJUiZMvB` is Ready at
`https://www.okolo.events/partners`. Desktop and 390 px mobile rendering, image delivery,
click-through to the interactive map, `/aecfestival` 404 behavior, security headers and the Vercel
error-log scan passed.
