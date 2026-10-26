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
