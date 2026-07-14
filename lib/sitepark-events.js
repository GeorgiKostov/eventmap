// Deterministic helpers for Sitepark event RSS feeds whose entries expose a
// per-event iCal export. Stuttgart uses this pattern for its official calendar.
// The RSS prose and images are deliberately ignored: only title/date/location/
// categories and the canonical detail URL from iCal are retained.

import { decodeEntities } from './entities.js';

// RSS payloads arrive in CDATA; unwrap, then use the ONE entity decoder.
function decodeXml(value) {
  return decodeEntities(String(value ?? '').replace(/<!\[CDATA\[|\]\]>/g, '')).trim();
}

function xmlTag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

export function parseSiteparkRssItems(xml) {
  return [...String(xml || '').matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => ({
      title: xmlTag(match[0], 'title'),
      detailUrl: xmlTag(match[0], 'link'),
    }))
    .filter((item) => item.title && /^https?:\/\//i.test(item.detailUrl || ''));
}

export function siteparkIcalUrl(detailUrl) {
  const url = new URL(detailUrl);
  url.searchParams.set('sp:out', 'iCal');
  return url.toString();
}
