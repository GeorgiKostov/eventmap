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
  last_crawled  timestamptz
);

create table if not exists events (
  id            bigint generated always as identity primary key,
  title         text not null,
  description   text,
  starts_at     text not null,
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

create table if not exists geocache (
  query text primary key,
  lat   double precision,
  lng   double precision,
  label text,
  hit   boolean default true
);
