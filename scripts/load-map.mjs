// Bounded map/API load rehearsal. Defaults to localhost and refuses to generate
// traffic against a remote service unless ALLOW_REMOTE_LOAD_TEST=1 is explicit.
// Examples:
//   node scripts/load-map.mjs
//   TARGET_URL='https://staging.example/api/events?...' REQUESTS=200 CONCURRENCY=10 \
//     ALLOW_REMOTE_LOAD_TEST=1 node scripts/load-map.mjs
function viennaDate(dayOffset = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + dayOffset * 86400000));
}
const DEFAULT_PATH = `/api/events?view=map&bbox=14.25,48.27,14.36,48.35&zoom=13&from=${viennaDate()}&to=${viennaDate(30)}`;
const target = new URL(process.env.TARGET_URL || `http://localhost:3311${DEFAULT_PATH}`);
const requests = Math.max(1, Math.min(500, Number(process.env.REQUESTS) || 100));
const concurrency = Math.max(1, Math.min(20, Number(process.env.CONCURRENCY) || 5));

if (!['localhost', '127.0.0.1'].includes(target.hostname) && process.env.ALLOW_REMOTE_LOAD_TEST !== '1') {
  throw new Error('Remote load tests require ALLOW_REMOTE_LOAD_TEST=1 and an explicitly authorized TARGET_URL.');
}

const timings = [];
const cache = new Map();
let next = 0;
let errors = 0;
let bytes = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const res = await fetch(target, { headers: { Accept: 'application/json' } });
      const body = await res.arrayBuffer();
      timings.push(performance.now() - started);
      bytes += body.byteLength;
      const status = res.headers.get('x-vercel-cache') || 'not-set';
      cache.set(status, (cache.get(status) || 0) + 1);
      if (!res.ok) errors++;
    } catch {
      timings.push(performance.now() - started);
      errors++;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));
timings.sort((a, b) => a - b);
const percentile = (p) => timings[Math.min(timings.length - 1, Math.floor(timings.length * p))] || 0;

console.log(JSON.stringify({
  target: target.toString(),
  requests,
  concurrency,
  errors,
  error_rate: Number((errors / requests).toFixed(4)),
  p50_ms: Math.round(percentile(0.5)),
  p95_ms: Math.round(percentile(0.95)),
  average_bytes: Math.round(bytes / requests),
  vercel_cache: Object.fromEntries(cache),
}, null, 2));

if (errors > 0) process.exitCode = 1;
