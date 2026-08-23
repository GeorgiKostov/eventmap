// Quarantine legacy events whose start is not a real Okolo local date/time.
// Recoverable: rows are retained as expired evidence; no date is guessed.
import postgres from 'postgres';
import { validLocalEventTime } from '../lib/event-time.js';

const sql = postgres(process.env.DATABASE_URL || '', {
  prepare: false, max: 1, connection: { search_path: 'umkreis' },
});
const rows = await sql`SELECT id, starts_at FROM events WHERE kind='event' AND status='published'`;
const ids = rows.filter((row) => !validLocalEventTime(row.starts_at)).map((row) => row.id);
if (ids.length) await sql`UPDATE events SET status='expired' WHERE id = ANY(${ids})`;
console.log(`Invalid event dates quarantined: ${ids.length} published row(s).`);
await sql.end();
