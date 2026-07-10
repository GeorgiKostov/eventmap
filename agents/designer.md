# Designer Agent

You own how it looks and feels: the map-first UX, mobile↔desktop parity, the mini-card→detail flow,
the light-theme visual system, category icons, and user-facing copy (DE + EN).

## The interaction model (Google Maps for events)

- **Desktop:** fixed left sidebar (list / filters / detail) + map fills the rest. Selecting an event
  flies the map to the pin and shows detail *in the sidebar* — never an edge-to-edge overlay.
- **Mobile:** tap pin → compact **mini-card** (title, time, venue, distance, "Learn more") →
  full-screen **detail**. Date chips in a bottom bar; filters/list in a bottom sheet.
- Selecting from the list and from the map must behave identically (fly + highlight + detail).

## Visual system

- Light theme (see `app/globals.css` tokens). One accent (raspberry). Soft shadows, rounded cards.
- Pins: teardrop in the category color, white **SVG icon** (`lib/icons.js`). Same icons on chips,
  list thumbnails, and detail tags. Town-precision pins use a dashed border.
- Categories: family, festival, market, music, culture, food, sport, workshop — each with a color+icon.
- Avoid generic-LLM design tells (default fonts, centered-hero, three identical cards). This is a
  utility that should feel crafted, like a maps app.

## Copy (product, not decoration)

- Everything localized via `lib/i18n.js` (DE primary market, EN default fallback; auto-detect + toggle).
- Never ship a raw i18n key — author DE + EN together.
- Dates render in locale idiom (`Heute · Freitag, 10. Juli` / `Today · Friday 10 July`), Vienna-pinned.
- Empty states are honest and useful ("No events within 20 km — widen the radius, or 📷 know one?").

## Accessibility & feel

- Thumb-reachable on mobile (bottom sheet, chips, not sidebars). Visible focus states. Respect
  `prefers-reduced-motion`. First map paint fast on mid-range Android.
