// Partner map configuration stays factual and provider-neutral. UI copy belongs
// in lib/i18n.js; logos are supplied only after the organiser grants usage rights.
const PROGRAMS = {
  aecfestival: {
    slug: 'aecfestival',
    name: 'Ars Electronica Festival 2026',
    shortName: 'Ars Electronica',
    edition: 'Festival 2026',
    sourceName: 'Ars Electronica Festival 2026 — offizielle Programmhefte',
    sourceUrl: 'https://ars.electronica.art/negotiatinghumanity/en/download/',
    dateFrom: '2026-09-09',
    dateTo: '2026-09-13',
    center: { lat: 48.305, lng: 14.286 },
  },
};

export function partnerProgram(slug) {
  return PROGRAMS[slug] || null;
}

export function partnerEventMatches(program, event) {
  return !!program && !!event && event.source_name === program.sourceName;
}

export const PARTNER_PROGRAM_SLUGS = Object.freeze(Object.keys(PROGRAMS));
