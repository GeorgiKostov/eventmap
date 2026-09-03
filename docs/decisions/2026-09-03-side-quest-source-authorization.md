# 2026-09-03 — Treat Side Quest Linz as discovery, not a crawl source

Status: adopted · Owner: Architect.

## Decision

Do not mine or register Side Quest Linz's Notion/Instagram calendar. It is a third-party curated
event database rather than the publisher of the underlying events, and no reuse licence or public
data feed was found. Side Quest may be used manually as discovery evidence only: follow each lead
to the organizer or venue's official calendar, perform the source-authorization check there, and
store only factual fields with an official linkback.

The same audit produced these per-source operating decisions:

| Source | Decision | Reason / safe path |
|---|---|---|
| `sidequestlinz.notion.site` | Do not crawl | Third-party curated database; no reuse licence. Seek written permission or a partnership before automation. |
| `last-space.at` | Facts-only crawl allowed | Official venue calendar; public event pages have no robots exclusion. Do not copy prose or images. |
| `ccsmaragd.at` | Facts-only crawl allowed | Official venue calendar; public event paths are robots-allowed. Do not copy prose or images. |
| `frl-florentine.at` | Facts-only crawl allowed | Official venue calendar; the public calendar is robots-allowed. Do not copy prose or images. |
| `le-jardin.at` | Permission required | The site's imprint limits copying/reuse beyond private non-commercial use. |
| `linztourismus.at` | Do not crawl | The published terms prohibit automated queries/scraping and data reuse. Use only to discover primary organizers. |
| `kupfticket.com` | Do not crawl | Third-party ticketing database with no identified reuse licence or public event API. Follow organizer links instead. |
| `posthof.at` | Crawl allowed | Official programme; published `llms.txt` explicitly permits indexing and factual reference with attribution while excluding media/training use. |
| `club.stwst.at` | Crawl allowed, but do not duplicate | Official first-party programme; Okolo already has Stadtwerkstatt registered at `https://wp.stwst.at/`. |

## Evidence checked on 2026-09-03

- Side Quest robots and Notion data-control context:
  `https://sidequestlinz.notion.site/robots.txt`, `https://www.notion.com/help/privacy`
- Last Space robots/imprint/calendar:
  `https://last-space.at/robots.txt`, `https://last-space.at/view/impressum`,
  `https://last-space.at/page/event`
- CulturCafé Smaragd robots/imprint/calendar:
  `https://www.ccsmaragd.at/robots.txt`, `https://www.ccsmaragd.at/impressum/`,
  `https://www.ccsmaragd.at/veranstaltungen-linz/`
- Fräulein Florentine robots/contact/calendar:
  `https://frl-florentine.at/robots.txt`, `https://frl-florentine.at/kontakt/`,
  `https://frl-florentine.at/eventkalender-schiff/`
- Le Jardin robots/imprint: `https://www.le-jardin.at/robots.txt`,
  `https://www.le-jardin.at/impressum-lj/`
- Linz Tourismus terms: `https://www.linztourismus.at/freizeit/tvlinz-agb`
- KUPFticket terms: `https://kupfservices.com/terms/shop/`
- Posthof robots/AI-use policy: `https://www.posthof.at/robots.txt`,
  `https://www.posthof.at/llms.txt`
- Stadtwerkstatt robots/contact: `https://club.stwst.at/robots.txt`,
  `https://club.stwst.at/kontakt/`

This is an operational authorization decision, not a claim that robots.txt alone grants reuse
rights. Terms, licences, first-party status and database-right risk remain part of every new-source
check under hard rule 9.
