# Seasonal discovery is recurring, local and combinable

George requested a standing seasonal rule and inclusion in the existing weekly preparation task,
with matching newsletter visuals and automatic retirement after a season. He also corrected two
behaviors in the first release: selecting a theme must not zoom out, and themes must combine like
ordinary filters rather than behave as exclusive date shortcuts.

Decision: use shared, annual promotion windows; support Easter, Valentine's Day and Fasching in
addition to the four existing holiday themes. Seasonal selections combine with OR, while map,
date, search and other constraints stay intact. Retire expired promotion automatically without
deleting factual event history. Newsletter decoration depends on real selected events and the
issue dates. Extend the existing Wednesday automation, preserving cadence and publishing guards.

Calendar and editorial contract: `docs/ops/seasonal-discovery.md`. This supersedes the national
zoom and today–January 31 preset described in `2026-10-16-seasonal-discovery.md`.

Released 2026-10-17: code commit `1d99c66`, Vercel `dpl_8gwVLiE5qp353Agtnxn2Mi6h1z6J`,
public URL `https://www.okolo.events`. All 419 tests pass including HTTP checks; local and Vercel
production builds generated 111 pages. Desktop/mobile browser checks preserve the map and chosen
dates with multiple themes; API union results match their constituent queries and cluster totals.
Newsletter HTML/text and its local rendered preview pass; no subscriber email was sent. The
existing Wednesday automation was updated and remains active at 16:00 Europe/Vienna.
