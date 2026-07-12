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
  last_crawled  timestamptz,
  cms           text,               -- ris | gem2go | other | unknown | null (not yet classified)
  region        text,               -- Bundesland, e.g. 'Oberösterreich' | 'Salzburg' | 'Wien' ...
  discovered_at timestamptz default now(),
  page_hash     text,               -- sha256 of stripped page text; unchanged → skip extraction
  feed_kind     text,               -- jsonld | ical | rss | gem2go | llm | null (which route won last crawl)
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
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists events_starts_idx on events(starts_at);
create index if not exists events_status_idx on events(status);
create index if not exists events_kind_idx on events(kind);

create table if not exists geocache (
  query text primary key,
  lat   double precision,
  lng   double precision,
  label text,
  hit   boolean default true
);
