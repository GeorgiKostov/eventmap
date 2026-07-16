create schema if not exists umkreis;
set search_path = umkreis;

create table if not exists sources (
  id            bigint generated always as identity primary key,
  name          text not null,
  url           text unique not null,
  kind          text not null,
  town          text,
  works         boolean default true,
  notes         text,
  blocked_reason text,          -- robots | ai_bot_policy | js_spa | bot_block | null. A STATE, not a
                                -- failure streak (docs/design/big-city-quality.md §2): set by the
                                -- crawl when its own robots.txt check disallows the path, or by hand
                                -- for the other reasons (js_spa/bot_block/ai_bot_policy are never
                                -- auto-detected here). While set, the crawl skips the source without
                                -- touching zero_streak/tier; cleared automatically once a fetch
                                -- succeeds again. scripts/migrate-blocked-reason.mjs
  last_crawled  timestamptz,
  cms           text,               -- ris | gem2go | dvv | sitepark-ical | other | unknown | null
  region        text,               -- Bundesland, e.g. 'Oberösterreich' | 'Salzburg' | 'Wien' ...
  country       text not null default 'AT', -- ISO 3166-1 alpha-2, e.g. 'AT' | 'BG' | 'DE'
  discovered_at timestamptz default now(),
  page_hash     text,               -- sha256 of stripped page text; unchanged → skip extraction
  feed_kind     text,               -- jsonld | ical | gem2go | dvv | rss | llm | null
  etag          text,               -- last response ETag (conditional GET, generic shell only)
  last_modified text,               -- last response Last-Modified (conditional GET, generic shell only)
  default_categories text[] not null default '{}', -- categories every event from this source inherits
                                    -- (a children's museum's events ARE family events even when the
                                    -- text never says so) — appended, never substituted. Only for
                                    -- unambiguously single-audience sources; scripts/migrate-source-categories.mjs
  default_venue   text,             -- single-venue publishers (a theatre, a museum) name the ROOM,
  default_address text,             -- not the house: Dschungel Wien lists "Bühne 1"/"Bühne 2", which
                                    -- no geocoder can place. The venue is the PUBLISHER's identity,
                                    -- not in the event text — used as a fallback when an event from
                                    -- such a source resolves no better than town level.
                                    -- scripts/migrate-source-venue.mjs
  -- content-rating / tiering (scripts/crawl.mjs) — see tier threshold comment there
  crawl_count   int default 0,      -- total crawl attempts (incl. hash-unchanged skips)
  events_last   int,                -- events found on the most recent extraction round
  events_sum    int default 0,      -- running total, incremented only when extraction ran
  zero_streak   int default 0,      -- consecutive extraction rounds / fetch failures with 0 events
  last_changed  timestamptz,        -- last time page_hash actually differed from the stored one
  tier          text                -- active | slow | dormant | dead | null (not yet rated)
);

create table if not exists events (
  id            bigint generated always as identity primary key,
  kind          text not null default 'event', -- event | place
  title         text not null,
  description   text,
  starts_at     text,              -- required for kind='event'; null for kind='place' (no date)
  ends_at       text,
  all_day       boolean default false,
  lat           double precision not null,
  lng           double precision not null,
  geo_precision text default 'town',
  venue         text,
  address       text,
  town          text,
  country       text not null default 'AT', -- ISO 3166-1 alpha-2; drives timezone + geocode bounds
  tz            text,              -- IANA zone for THIS event's coords (lib/geocode.js tzForEvent);
                                    -- multi-timezone countries (US, RU, CA, AU, BR...) need per-row
                                    -- zone, not a single per-country one — see expireFinished()
  categories    text[] not null default '{}',
  is_free       boolean,
  age_min       int,
  age_max       int,
  indoor        boolean,
  emoji         text,
  photo_path    text,
  opening_hours jsonb,             -- places only: {mon:[["09:00","18:00"]],...} | {"always":true} | null = unknown
  seasonal      text,              -- places only: free-text note, e.g. "Mai–September"
  status        text not null default 'published',
  src_kind      text not null default 'crawl',
  source_name   text,
  source_url    text,
  content_hash  text unique,
  -- Stamped when scripts/enrich-locations.mjs actually FETCHED this event's detail
  -- page (and, with --llm, paid a model to read it) — NOT when it succeeded. Without
  -- it, a resumed run walks the same stable ordering from the top and re-pays for
  -- every page a prior run already proved states no location. This is what makes
  -- the enrichment pass safely re-runnable / cron-able. scripts/migrate-enrich-attempts.mjs
  enrich_attempted_at timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists events_starts_idx on events(starts_at);
create index if not exists events_status_idx on events(status);
create index if not exists events_kind_idx on events(kind);

-- Viewport rebuild (briefs/viewport-rebuild-brief.md, scripts/migrate-viewport.mjs):
-- generated PostGIS point + GiST index so the map's bbox query
-- (`geom && ST_MakeEnvelope(...)`) replaces "ship every event, filter by radius
-- client-side". Supabase convention: extensions live in the `extensions` schema.
create extension if not exists postgis with schema extensions;
-- Diacritic-folding for global search (scripts/migrate-unaccent.mjs) so
-- "munchen" finds "München"; searchEvents wraps title/venue/town in unaccent().
create extension if not exists unaccent with schema extensions;
alter table events add column if not exists geom extensions.geometry(Point,4326)
  generated always as (extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)) stored;
create index if not exists events_geom_idx on events using gist (geom);

-- Small key/value store; today just a throttle for the read-path
-- expire-finished-events sweep (expireIfStale in lib/db.js) so reads don't
-- also write on every request.
create table if not exists meta (key text primary key, value text);

-- Venues registry (docs/design/big-city-quality.md §1): resolved venue name +
-- town → coordinates, with provenance. Consulted by geocodeEvent() before the
-- Nominatim waterfall; written back by every enrichment path. Distinct from
-- geocache: geocache rows are disposable query results, venue rows are facts.
create table if not exists venues (
  id            bigint generated always as identity primary key,
  name          text not null,
  town          text,
  country       text not null default 'AT',
  name_norm     text not null,      -- normalizeName(name) (lib/geocode.js)
  town_norm     text not null default '',
  lat           double precision not null,
  lng           double precision not null,
  geo_precision text not null default 'venue',   -- venue | address
  resolved_via  text not null,      -- event | place | geocode | detail_page | search | manual
  source_url    text,
  verified_at   timestamptz default now(),
  unique (name_norm, town_norm, country)
);

create table if not exists geocache (
  query text primary key,
  lat   double precision,
  lng   double precision,
  label text,
  hit   boolean default true
);

-- newsletter signups (no accounts; locality is deliberately coarse — never device GPS)
create table if not exists subscribers (
  id             bigint generated always as identity primary key,
  email          text unique not null,
  source         text,               -- e.g. 'newsletter_popup'
  lang           text,
  area_label     text,               -- chosen town/postcode, shown back to the subscriber
  area_lat       double precision,   -- locality/postcode centre, not a precise user position
  area_lng       double precision,
  radius_km      integer not null default 20 check (radius_km between 3 and 40),
  categories     text[] not null default '{}',
  created_at     timestamptz default now(),
  -- double opt-in (GDPR/TKG): a subscriber is only "active" once confirmed and
  -- not unsubscribed. `token` is the per-subscriber secret for the confirm and
  -- unsubscribe links; rotated whenever a pending/unsubscribed row re-subscribes.
  -- Confirm links expire CONFIRM_TTL_DAYS after `token_issued_at` (lib/db.js);
  -- unsubscribe never expires — revoking consent must always work.
  token          text,
  token_issued_at timestamptz,
  confirmed_at   timestamptz,
  unsubscribed_at timestamptz,
  -- proof of consent (Art. 7(1) GDPR): when they signed up, which version of
  -- the consent wording they saw (NL_CONSENT_VERSION in lib/i18n.js), and the
  -- same hashed-IP value the rate limiter uses — never the raw IP.
  consent_version text,
  consent_ip_hash text,
  consent_at      timestamptz
);

-- durable, IP-hash-keyed rate limiting for anonymous writes (scan + submit).
-- The old in-memory Map is useless on serverless (each invocation is isolated).
create table if not exists rate_hits (
  id       bigint generated always as identity primary key,
  ip_hash  text not null,
  action   text not null,            -- 'scan' | 'submit'
  at       timestamptz default now()
);
create index if not exists rate_hits_lookup on rate_hits(action, ip_hash, at);
create index if not exists rate_hits_at on rate_hits(at);

-- Anonymous one-tap signals on an event/place. No accounts, no free text: `kind`
-- is a closed enum, so the worst a bot can do is skew a counter — there is nothing
-- here to moderate, defame with, or spam-link. Two families share the table
-- because they have the same shape (entity + enum + dedupe key):
--   'interest'                              — "I want to go" / saved (see docs/decisions)
--   'cancelled'|'wrong_time'|'wrong_info'|'not_free'
--                                           — data-quality reports (design doc hard rule 5)
-- Dedupe is per hashed IP, so a household behind one NAT counts once. That
-- undercounts rather than inflates — the right direction to be wrong in.
create table if not exists reactions (
  id       bigint generated always as identity primary key,
  event_id bigint not null references events(id) on delete cascade,
  kind     text not null check (kind in ('interest','cancelled','wrong_time','wrong_info','not_free')),
  ip_hash  text not null,
  at       timestamptz default now(),
  unique (event_id, kind, ip_hash)
);
create index if not exists reactions_event_idx on reactions(event_id, kind);
