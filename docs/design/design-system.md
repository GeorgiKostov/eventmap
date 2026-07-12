# Okolo — Design System

> Status: living document · Owner: Designer/Architect · Source of truth for tokens, marker grammar,
> and control vocabulary. **Any new feature that adds UI must cite this.** If a feature needs
> something not here, add it here first, then build.
>
> Implemented in `app/globals.css` (`:root` tokens + component classes) and `lib/icons.js` (`CATS`).
> The product name is **Okolo** everywhere. The working name *Umkreis* is retired.

---

## Tokens — never hardcode

All visual constants live in `app/globals.css :root` and `lib/icons.js CATS`. Reference them; never
paste a hex, radius, or shadow inline. (WebGL map paint — MapLibre `paint` expressions — is the one
exception: it cannot read CSS variables, so a few layer colors are literal there. Everything in the
DOM uses tokens.)

- **Surfaces:** `--bg #f2f2ee` · `--panel #fff` · `--panel2 #f6f6f3` · `--line #e4e4dd`
- **Ink/quiet:** `--ink #212b28` · `--muted #6d7876`
- **Brand:** `--accent #c93a5b` · `--accent-soft #fbeef1` · `--accent-ink #fff`
- **Status:** `--good #2e7d4f` · `--warn #b26a1b` · `--community #e59500` (community/user-submitted trust only)
- **Categories:** from `CATS` in `lib/icons.js` — the *only* source. 8 event + 8 place cats. Pins,
  chips, thumbs, list rows, detail tags, legend all read `CATS[cat].color` (via the `--cc`/`--cx`
  custom property). No category hex literal may exist outside `CATS`.
- **Elevation:** `--shadow-sm` (resting cards/chips) · `--shadow-md` (map controls/menus) ·
  `--shadow-lg` (modals/detail/popovers). Don't invent new shadows.
- **Radius:** pill `999px` · card `16–18px` · control `12–14px` · thumb `12px`. Nothing else.

### Category contrast rule
Pin/thumb glyphs are white. A category color must clear **≥3:1** contrast with white (AA for the
~15px bold icon) or the glyph would be a weak target. The two light golds were pre-darkened in `CATS`
to satisfy this at the token level (so the fix propagates everywhere, and the white-glyph rule stays
uniform — no per-pin ink logic):
- `food` `#B8860B → #A0750A` · `playground` `#B5A82E → #9D9228`

Any **new** category color must be chosen at ≥3:1 vs white. If a future palette needs a color that
can't reach that, switch that category's glyph to `--ink` — but the darken-the-token approach is
preferred because it keeps one glyph color everywhere.

## Type

- `--font-display` is used **only** for the detail `h2` and add-flow headings. `--font-body` (the
  platform UI stack) is everything else.
- The **wordmark is an inline SVG** (`.okolo-mark`, radar identity), so it is OS-independent by
  construction — it renders identically on macOS/Windows/Android regardless of installed fonts.
- `--font-display` currently leads with `"Avenir Next"` and falls back through `"Segoe UI"`,
  `system-ui`. This is *not* pixel-identical across OSes (Apple-only lead). It only affects a few
  headings, not the wordmark. **Follow-up (backlog):** self-host one OFL display webfont
  (woff2, `font-display:swap`) if heading consistency across platforms becomes important.
- Min sizes: body 13px · meta 11px · uppercase eyebrows 10.5px/`.11em`. Numbers (time, distance,
  dates, counts) use `font-variant-numeric: tabular-nums`.

## Map marker grammar — the hard cap

A pin encodes **at most**: color = category · shape = kind · one optional trust badge · optional
approx halo. **Selection is the only thing allowed to add a ring/scale.**

- **Color = category**, from `CATS`. One job only. White glyph (see contrast rule).
- **Shape = kind**, two values only: event = teardrop (`50% 50% 50% 4px`), place = circle
  (`.pin-place`). **No third shape.** "Many" — a venue group *or* a same-title series — is the ink
  **count badge** (`.pin-badge`, top-right), never a new silhouette. (The old rounded-rect
  `.pin-series` shape was retired.)
- **Trust = one small corner badge** (`.pin-community`, top-left, `--community` fill) for genuinely
  user-submitted pins. The *same* `--community` token identifies community items in the list
  (`.source-tag.community` dashed border) and the legend (`.legend-pin.community` corner dot). One
  representation across pin + list + legend. (The old whole-pin community ring was retired.)
- **Precision = dashed halo** (`.approx-precision`) for town-level positions only.
- **Selected = scale + soft halo** (`.pin2.selected`). Nothing else may use a full-pin ring/halo.
- The count badge (top-right) and community badge (top-left) never collide.
- **Every signal in use must appear in the collapsible `.map-legend`.** Legend rows: event, place,
  community, approximate, more-at-venue (count), cluster.

## Control vocabulary — one grammar per intent

- **Binary on/off** (kids / free / indoor / always-open / free-entry, in filters *and* the add form)
  → **chip** (`.chip`, `.chip.on` = accent-soft fill). **Never an iOS-style switch** — the
  `.toggle`/`.knob` switch vocabulary was removed so there is exactly one binary grammar.
- **Mutually-exclusive set** (kind, setting any/in/out, time-of-day) → segmented control `.seg`.
- **Range** → `input[type=range]` with `accent-color:var(--accent)` + a tabular `output`.
- **Date** → Today / Tomorrow / Weekend / 7-days chips + the calendar range picker. **Weekend is the
  family default.**
- **Primary action** → `--accent` fill + `--accent-ink`. One primary per screen.
- **Floating controls** (locate + Add) live in **one reflowing bottom-right stack** (`.floatstack`,
  `flex-direction:column-reverse` so the primary Add FAB sits closest to the filter bar, locate above
  it). Anchored once above the filter bar; the whole stack hides where it would overlap a sheet or
  full-screen detail. **Never hand-place per-element `bottom:` offsets** — that magic-number stack
  (`.lifted`/`.above-sheet`) was removed after it caused overlap regressions.

## Layout model

- **Desktop ≥900px:** fixed 416px sidebar (`--sidebar-w`) + map. Detail is a side panel, never
  edge-to-edge.
- **Mobile <900px:** map-first; pin → mini-card docked under the search bar → full-screen detail.
  Bottom filter bar + sheet (half/full). MapLibre zoom buttons hidden (pinch is native).
- **Location picking:** exactly one model. Events and places are positioned on the **main map**
  (`.map-crosshair` + `.mappick-bar`, two-way address↔map). The pin-drop mini-map (`.pinpicker` /
  `PinDropPicker`) exists **only** for the post-publish town-level refine step — do not reintroduce
  it as a second general picker.
- **Overlays stay inside their positioning container.** Audit the containing block whenever an
  overlay moves (lessons.md 2026-07-12).

## Copy & content

- **Facts + linkback only.** Unknown → `null` (render nothing). Write our own descriptions; never
  copy source prose/images. Every item keeps its `source_url`.
- All UI strings go through `lib/i18n.js` in **de / en / bg**. No hardcoded UI text. Product name is
  **Okolo**; the word *Umkreis* must not appear in shipped UI/i18n.
- **Vienna wall-clock** for every now/today/expiry/bucket computation (`viennaNow()` server-side;
  `Intl` with `timeZone:'Europe/Vienna'` client-side).

## Interaction principles (from lessons.md — keep)

- **One control, one meaning** — don't overload a control with a second job to save space.
- **Async feedback <100ms** — any fetch-triggering control responds instantly (optimistic /
  last-known + pulse) and fails with a cause-specific message.
- **Trust > completeness** — a wrong pin costs more than a missing one.

---

## Open call (not a code task)
- **Family = filter or default lens?** The weekend-default already leans "lens." This changes whether
  "Kids" is one chip or the app's opening state. Decision to be recorded in `docs/decisions/`
  (design-doc §11.3). Until decided, "Kids" stays a binary chip.
