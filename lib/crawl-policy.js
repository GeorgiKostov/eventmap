const CRAWL_MODES = new Set(['all', 'structured', 'llm']);

export function normalizeCrawlMode(value) {
  const mode = String(value || 'all').toLowerCase();
  if (!CRAWL_MODES.has(mode)) {
    throw new Error(`Unknown crawl mode "${value}". Expected all, structured, or llm.`);
  }
  return mode;
}

export function normalizeCountry(value) {
  if (!value) return null;
  const country = String(value).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new Error(`Invalid country "${value}". Expected a two-letter country code such as AT.`);
  }
  return country;
}

// `feed_kind` is the route that won the source's last successful extraction.
// Unknown sources join the weekly LLM lane so a newly registered source cannot
// surprise the token-free daily lane with a paid fallback. The weekly lane
// still tries the structured waterfall first and promotes any newly-supported
// source to its deterministic route for future daily runs.
export function sourceMatchesCrawlPolicy(source, { country = null, mode = 'all' } = {}) {
  if (country && (source.country || 'AT') !== country) return false;
  if (mode === 'all') return true;
  if (mode === 'llm') return !source.feed_kind || source.feed_kind === 'llm';
  return !!source.feed_kind && source.feed_kind !== 'llm';
}
