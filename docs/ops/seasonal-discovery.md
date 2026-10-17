# Seasonal discovery and weekly editorial rule

George requested this recurring rule on 2026-10-17, following the first Christmas/Halloween release.
Seasonal discovery should help people find real local events, with recognizable icons and a small
amount of seasonal color. It must respect the map area, search, dates and family constraints the
visitor already chose. Multiple seasons combine with OR; other filters remain AND constraints.

## Promotion lifecycle

`lib/seasonal-events.js` owns the promotion calendar and factual title matching. These are
editorial visibility windows, not claims that every event runs for the whole window. Compute
today in Europe/Vienna; calculate movable dates afresh for the relevant year.

| Theme | Show filter from | Retire after | Visual |
|---|---|---|---|
| Halloween | September 15 | November 1 | Pumpkin / orange |
| Christmas markets | October 1 | January 6 | Tree / green |
| Advent & Christmas, including Nikolaus/Krampus/Perchten | November 1 | January 6 | Gift / red |
| New Year | December 1 | January 31 | Spark / purple |
| Valentine's Day | February 1 | February 15 | Heart |
| Fasching | January 7 | Shrove Tuesday (Easter minus 47 days) | Carnival mask |
| Easter | Six weeks before Easter Sunday | Easter Monday | Egg |

Promotion retires automatically, including a tab left open across midnight. Clear only expired
season selections; keep the user's other filters and map position. Keep event classification,
normal dated discovery and historical records intact: a genuine event outside a promotion window
is still an event. Do not delete events just because a decorative campaign has ended. Ordinary
event expiry still follows the database's existing Vienna-local rules.

## Weekly preparation — existing Wednesday run

Extend `post-okolo-weekend-carousels` (Wednesday 16:00 Europe/Vienna), rather than create another
schedule. The Sunday crawl and Thursday newsletter prepare/send schedules keep their existing
cadence, source authorization, spend limits, recipient checks and duplicate ledgers.

Before preparing the weekend issues:

1. Review the next 90 days of the Austrian seasonal calendar, and identify themes newly entering
   or leaving their promotion window. Read the shared code and this runbook rather than carrying
   last year's hardcoded dates forward.
2. Check real, future, source-linked event coverage in the active city editions and existing
   Austrian map coverage. Prioritize gaps relevant to the upcoming weekend. Refresh already
   approved registered sources through the normal crawl route; respect existing budget/provider
   limits. New sources require the repository authorization audit and repeatable adapter path.
3. Review dates, venues, distinct markets versus daily occurrences, cancellations, duplicates,
   and family suitability. Holiday identity alone never establishes a child-friendly event.
   Report shortages honestly; do not create placeholder events or promise complete coverage.
4. Use seasonal visuals only when matching events actually appear in the frozen issue. Keep
   useful ordinary events in the selection; do not pad a holiday edition at the expense of quality.
5. Check the map's active filters and expiry against the deployed runtime. Missing support or a
   deployment mismatch is a follow-up item, not permission for the routine publishing task to
   modify/deploy tracked code. Run seasonal lifecycle tests when code changes through the normal
   development workflow.
6. Include activated/retired themes, verified additions/refreshes, gaps, and newsletter visual
   choice in the existing run report. Preserve the Wednesday no-subscriber-email rule and all
   existing social-account and newsletter-consent constraints.

## Austrian watchlist

Supported initial set: Christmas markets, Advent/Christmas, Halloween, New Year, Easter,
Valentine's Day and Fasching. Also review Fasching's November 11 opening, May Day/Maypole events,
summer solstice celebrations, Almabtrieb, Erntedank, National Day (October 26), Martin/lantern
processions, Nikolaus/Krampus and regional fairs such as Rupertikirtag or Leopoldi. A watchlist
entry is not an always-visible filter; add one only when real local inventory justifies a distinct
theme, with a tested end date, localized copy and matching visuals.

Calendar context: [Austria Tourism's traditions overview](https://www.austria.info/en-gb/inspiration/traditions/),
[seasonal customs](https://www.austria.info/en-gb/highlights/traditional-festivals/) and
[Easter traditions](https://www.austria.info/en-gb/inspiration/easter-markets-and-traditions/).
These establish traditions, not individual event dates or bulk-data permission.

## Newsletter visuals

Use a compact original decorative banner with a theme icon, readable localized label and
matching accent color. Choose from the actual frozen picks overlapping that issue's weekend and
the promotion window. Keep rendering deterministic from the issue dates, so old issues do not
change theme when today's season changes. Neutral issues stay neutral; plain-text email must
retain the same meaning. Avoid copied source imagery, paid generation, tracking pixels and
image-only information. Preserve source links, sponsor disclosure and the current send guards.
