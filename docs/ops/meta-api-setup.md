# Meta Graph API setup — Instagram + Facebook publishing

Runbook for George to wire up `okolo`'s weekly carousel/Page post publishing
(`lib/social-publish.js`, `app/api/admin/social/route.js`, the Publish
buttons on `/admin/thursday`, `npm run social`). Until these env vars are
set, every surface says so honestly — nothing pretends to have posted.

One Meta Business account for the whole product (all city channels post
through the same IG/FB pair) — per-city accounts are a later extension.

## 1. Facebook Page + Instagram professional account

1. If okolo has no Facebook Page yet, create one (facebook.com → Pages →
   Create new Page). Any category works; this Page only ever receives our
   own posts.
2. Open the okolo Instagram account → Settings → Account type and tools →
   switch to a **Professional (Business) account** if it isn't already.
3. In the same Instagram settings, link it to the Facebook Page from step 1
   (Settings → linked accounts / "Sharing to other apps" → Facebook).

## 2. Create the Meta app

1. Go to developers.facebook.com → **My Apps** → **Create App**.
2. Choose type **Business**. Name it anything (e.g. "Okolo Publishing").
3. In the app dashboard, **Add products**: **Instagram Graph API** and
   **Facebook Login for Business**.
4. Leave the app in **Development mode** — it can stay there forever for
   this use case. App Review / Business Verification are only required to
   act on *other* people's accounts; posting to assets *you* own needs
   neither.

## 3. Create a system user + generate the token

1. Go to business.facebook.com → **Business Settings** → **Users** →
   **System Users** → **Add**.
2. Create a system user with role **Admin**.
3. **Assign assets**: give this system user access to the Facebook Page
   (from step 1) and the Instagram account (linked in step 1) — both must
   be assigned, or every Graph call will 403 with a permissions error.
4. Still in the system user, click **Generate New Token**, pick the app from
   step 2, and select scopes:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `business_management`
5. If the dialog offers a **token expiration** choice, explicitly pick
   **Never** — don't trust the default. A 60-day token silently breaks the
   whole pipeline two months later.
6. Copy the token — this is the value for `META_ACCESS_TOKEN`.
7. **Verify once in the developer console** that `instagram_content_publish`
   shows as usable for your app in Development mode. Meta has moved this
   permission between access tiers before; if it's gated behind "Advanced
   Access" even for own-account use, request that (it's an automated check
   for own assets, not a human review).

## 4. Get the ids

```sh
# FB_PAGE_ID — lists Pages this token can manage
curl 'https://graph.facebook.com/v23.0/me/accounts?access_token=TOKEN'

# IG_USER_ID — the Instagram business account linked to that Page
curl 'https://graph.facebook.com/v23.0/<PAGE_ID>?fields=instagram_business_account&access_token=TOKEN'
```

## 5. Env vars

Set these on **Vercel (Production)** and in **`.env.local`** for local runs:

```
META_ACCESS_TOKEN=<system user token from step 3>
IG_USER_ID=<from step 4>
FB_PAGE_ID=<from step 4>
```

`META_GRAPH_VERSION` is optional (defaults to `v23.0`).

**Important:** Meta fetches the carousel/post images from public URLs
(`NEXT_PUBLIC_BASE_URL` + `/api/social/card?...`). Local dev (`localhost`)
is not reachable from Meta's servers, so publishing for real only works
against the **deployed** site — local dev can only `--dry-run`.

## 6. First-run verification

```sh
# 1. Dry run (safe with or without credentials)
npm run social -- --channel linz --target instagram --dry-run

# 2. Once env vars are set on Vercel and a digest snapshot exists for the
#    current weekend, use the desk button (or the CLI without --dry-run)
npm run social -- --channel linz --target instagram
```

Notes:
- Instagram caps API-published posts at **50 per 24h** per account — far
  above our volume (one post per city per week).
- Instagram carousels take **2–10 images** (we send 1 cover + up to 9 event
  slides; a single-image weekend posts as a plain photo). If `DIGEST_MAX` in
  `lib/digest.js` is ever raised past 9, the carousel hits this hard ceiling
  and extra slides are silently cut.
- Instagram captions cap at **2200 characters** — the publisher checks this
  before uploading anything and fails with a clear message (drop a pick on
  the desk to shorten).
- A failed publish can simply be retried: the idempotence ledger
  (`posted:ig:<slug>:<friday>` / `posted:fb:<slug>:<friday>`) is only
  written **after** Meta confirms success, so a failed attempt leaves the
  door open for a clean retry.

## Troubleshooting

| Graph error | Meaning | Fix |
|---|---|---|
| `code 190` — invalid/expired token | Token is wrong, revoked, or was never a system-user token | Regenerate in Business Settings → System Users |
| `code 200` — permissions error | The system user doesn't have the Page/IG asset assigned, or is missing a scope | Business Settings → System Users → re-check **Assign assets**, regenerate token with all 5 scopes |
| `code 9004` / `code 2207052` — image fetch failed | Meta's servers couldn't reach the card URL | Confirm `NEXT_PUBLIC_BASE_URL` points at the live deployed site, not localhost; open the URL in an incognito window to confirm it's public |
| Carousel container stuck `IN_PROGRESS` past ~45s | Meta is still processing the image | Rare; retry — this isn't a config problem |
| "another publish … is running right now" | Two publish attempts overlapped (second desk tab, or desk + CLI) | Wait for the first to finish |
| "a previous publish attempt did not record an outcome" | An earlier attempt was killed mid-publish — **the post may be live** | Open the IG/FB page and look. Nothing there → retry with force. Post is there → leave it; the ledger stays empty for that weekend, which is safe (force is required for any re-post anyway) |
