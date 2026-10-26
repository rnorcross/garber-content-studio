-- Garber Content Studio schema. Safe to run repeatedly.

create table if not exists users (
  id            serial primary key,
  email         text not null unique,
  name          text not null,
  password_hash text not null,
  role          text not null default 'editor' check (role in ('admin', 'editor')),
  must_reset    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists dealerships (
  id          serial primary key,
  slug        text not null unique,
  name        text not null,
  city        text,
  makes       text[] not null default '{}',
  website     text,
  logo        text,
  logo_white  text,
  image_h     text,
  image_v     text,
  notes       text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists pages (
  id               serial primary key,
  dealership_id    int references dealerships(id) on delete set null,
  title            text not null,
  page_type        text not null default 'custom',
  live_url         text,
  status           text not null default 'draft' check (status in ('draft', 'live', 'archived')),
  current_version  int,
  live_version     int,
  live_marked_at   timestamptz,
  live_marked_by   int references users(id) on delete set null,
  notes            text,
  created_by       int references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists page_versions (
  id          serial primary key,
  page_id     int not null references pages(id) on delete cascade,
  number      int not null,
  html        text not null,
  source      text not null check (source in ('generated', 'imported', 'edited', 'ai-edit', 'restored')),
  prompt      text,
  note        text,
  created_by  int references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (page_id, number)
);

create index if not exists page_versions_page_idx on page_versions(page_id, number desc);
create index if not exists pages_dealership_idx on pages(dealership_id);

-- v2: SEO/social fields, live log, templates, media library -----------------

alter table pages add column if not exists meta_title text;
alter table pages add column if not exists meta_description text;
alter table pages add column if not exists canonical_url text;
alter table dealerships add column if not exists og_image text;

-- Every time someone records a version as live on the dealer site.
create table if not exists live_events (
  id          serial primary key,
  page_id     int not null references pages(id) on delete cascade,
  version     int not null,
  live_url    text,
  note        text,
  user_id     int references users(id) on delete set null,
  user_name   text,               -- kept even if the user is later removed
  created_at  timestamptz not null default now()
);
create index if not exists live_events_page_idx on live_events(page_id, created_at desc);

-- Page templates: what the "New page" picker offers and how Claude builds each one.
create table if not exists templates (
  id                 serial primary key,
  slug               text not null unique,
  name               text not null,
  description        text,
  brief              text not null default '',   -- instructions Claude follows for this template
  fields             jsonb not null default '[]', -- inputs the New page form asks for
  reference_page_id  int references pages(id) on delete set null,
  default_canonical  text,
  is_custom          boolean not null default false,
  active             boolean not null default true,
  sort               int not null default 100,
  updated_at         timestamptz not null default now()
);

-- Uploaded images and videos (stored in Vercel Blob, or on disk in local dev).
create table if not exists media (
  id             serial primary key,
  url            text not null unique,
  pathname       text not null,
  filename       text not null,
  content_type   text,
  size           int,
  width          int,
  height         int,
  alt            text,
  dealership_id  int references dealerships(id) on delete set null,
  uploaded_by    int references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists media_dealership_idx on media(dealership_id, created_at desc);
