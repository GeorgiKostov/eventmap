# Brand header consistency across pages

**Date:** 2026-08-30
**Status:** accepted

## Context

The map shell, discovery pages, event landings, weekend issues, legal pages, partner sales showcase,
partner demo and admin desks evolved independently. Their top-left identity drifted between no brand
text, an arrow plus capitalized name, text-only handles and several separately drawn pin lockups. The
earlier map-shell decision removed brand text to make room for the search-first Google Maps layout;
in practice that made the primary product surface the exception and let every new page choose its
own treatment.

## Decision

Every visual App Router page family begins at the top left with the shared `app/okolo-brand.js`
lockup: the Okolo pin icon and lowercase `okolo.` title, styled only by global design tokens.

- A recognized city channel may use its existing `channel.handle` as the suffix.
- Partner and admin context is a secondary qualifier beside the Okolo identity.
- Event detail retains its validated return path or tracked map-discovery link as the interactive
  wrapper, with the action copy adjacent to the shared lockup.
- The map shows the lockup persistently on desktop and mobile, including selected-event and partner
  states. Search remains directly below it.

This decision supersedes only the old map-shell choice to remove brand text. The search-first map
layout, map interaction model and partner marker grammar remain unchanged.

## Consequences

New visual routes must reuse the shared component rather than reproduce its SVG or typography.
Changes to the brand header are made once in the component/global CSS and reviewed across the route
families covered by `test/brand-header.test.mjs`.
