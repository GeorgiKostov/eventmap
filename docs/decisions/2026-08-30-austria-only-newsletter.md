# Austria-only newsletter market

> Status: approved by George; live in production · Date: 2026-08-30

## Context

Okolo's map can show Austrian, Bulgarian and German places, and the channel registry contains paused
city entries outside Austria. A Plovdiv visitor has already joined the list, but Bulgaria does not
yet have the reliable weekly event coverage needed to make a newsletter promise.

## Decision

- The newsletter is an Austrian product during the Linz validation phase. Map discovery outside
  Austria remains available; this decision changes neither map coverage nor event indexing.
- A selected non-Austrian locality shows a localized “available only in Austria” warning instead of
  a signup form. Contextual newsletter prompts are suppressed outside Austria.
- The subscription API accepts only an `AT` country result whose coordinates resolve offline to the
  `Europe/Vienna` zone. This prevents a neighboring-country point inside Austria's rectangular
  bounding box from being accepted accidentally.
- Every delivery path rejects non-Austrian channels. Existing non-Austrian subscriber rows are kept
  as consent records but excluded from delivery; they are not silently deleted or repurposed.
- Opening another country requires an explicit launch decision and enough repeatable local event
  coverage to support a useful weekly issue.

## Consequences

The Plovdiv signup remains stored but receives no Bulgarian or Austrian digest. Austrian visitors
can still choose German or English UI copy; newsletter market and interface language are separate.
The restriction is live from commit `2594e5c`, production deployment
`dpl_GQaLmghiEApe9uahz7e2HHri6Uqe`.
