# 2026-11-13 — Move to Neon, remove accounts and the add/scan flow

**Decision (George):** Okolo earns nothing, so hosting must cost €0. Close the Supabase project and
downgrade the Supabase org to Free; run Postgres on Neon's free tier via the Vercel Marketplace.

**Accounts removed, not ported.** Supabase Auth (Google + magic link, launched 2026-08-29) had 3
users, 0 saved favourites and 2 contributions. Porting to Better Auth / Neon Auth would have rebuilt
OAuth, magic links, SMTP and the hardening work for no real users. The poster scan, link import and
manual add (the only things accounts gated) were a test and are gone too; AI extraction was already
off under the 2026-10-27 zero-paid-AI policy. Saved events stay device-local (localStorage). Bring
either back only if the page is actually used — and then accounts need a moderation path (hard
rule 6).

**How it was done**
- Code: commit `f792fc9` deleted `/api/account/*`, `/auth/callback`, `/api/scan`,
  `/api/extract-url`, `POST /api/events`, `lib/account-auth|supabase-*|session-refresh|intake-proof`
  and the `@supabase/*` deps. Privacy page updated (Neon replaces Supabase; no account/poster data).
- Data: `pg_dump --schema=umkreis` (pg_dump 17.12; Supabase ran Postgres 17.6) restored into Neon
  "okolo" (Free `free_v3`, fra1, Postgres 18.7, PostGIS 3.6.4, pgvector 0.8.7 in `umkreis`). Row
  counts matched for all 11 tables (`scripts/compare-db-copy.mjs`). Local backups:
  `C:\Users\Georgi\Backups\okolo-supabase-2026-11-13\` (incl. `auth.users`).
- **Gotcha:** Neon's pooler ignores the client `search_path` startup parameter. The database default
  carries it (`ALTER DATABASE neondb SET search_path = umkreis, extensions, public`); pooled
  backends opened before that keep the old value until recycled.
- Cutover: crawl workflow paused, fresh dump re-restored, `DATABASE_URL` switched in Vercel
  (production + preview), the GitHub Actions secret and `.env.local`; prod deploy
  `dpl_DxDfqRftGYaPu8FCv3UcWMo8H7m2`. Live pages/API verified, Neon traffic confirmed, crawl
  re-enabled and a write crawl tested. `NEXT_PUBLIC_SUPABASE_*` Vercel vars removed; dead
  `user_favorites`/`event_contributions` tables dropped (`scripts/migrate-drop-accounts.mjs`).

**Free-tier watch:** 1 GB storage (we use ~220 MB), 100 CU-hours/month. The daily GitHub crawl
keeps the compute awake 40–105 min; check usage after the first week. Over-quota on Free means
an outage, not a bill.

**Supabase closed early (2026-11-14, George):** the okolo project was deleted and the org
downgraded to Free (the Spomen and Living Pages projects stay there). There is no live rollback any
more; the local dumps above are the only copy of the Supabase-era data.
