import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { bearerTokenValid } from '../../../../lib/admin-auth.js';

export const dynamic = 'force-dynamic';

// Crawls write to Supabase outside Vercel. Purge the static SEO subtree after
// a successful crawl so the next request renders against the new catalog.
export async function POST(req) {
  if (!bearerTokenValid(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  revalidatePath('/events', 'layout');
  return NextResponse.json({ revalidated: true, path: '/events' });
}
