-- Camelot Setlist — database schema.
-- Run once in Supabase Studio → SQL Editor. Safe to re-run.
--
-- Row Level Security is the only thing standing between users, so every table
-- that holds user data enables it and matches on auth.uid().

create extension if not exists "pgcrypto";

-- Keeps updated_at honest without trusting the client.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ——— libraries: one row per user, holds the whole rekordbox collection ———

create table if not exists public.libraries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tracks jsonb not null default '[]'::jsonb,
  playlists jsonb not null default '[]'::jsonb,
  extras jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists libraries_touch on public.libraries;
create trigger libraries_touch
before update on public.libraries
for each row execute function public.touch_updated_at();

alter table public.libraries enable row level security;

drop policy if exists libraries_own on public.libraries;
create policy libraries_own on public.libraries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ——— setlists: ids stay client generated so state shape never changes ———

create table if not exists public.setlists (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  entries jsonb not null default '[]'::jsonb,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists setlists_user_position on public.setlists (user_id, position);

drop trigger if exists setlists_touch on public.setlists;
create trigger setlists_touch
before update on public.setlists
for each row execute function public.touch_updated_at();

alter table public.setlists enable row level security;

drop policy if exists setlists_own on public.setlists;
create policy setlists_own on public.setlists
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ——— settings: filters and cursor, one row per user ———

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tolerance integer not null default 6,
  relations text[] not null default '{same,up,down,relative,boost}',
  genres text[] not null default '{}',
  pool_source text not null default 'catalog',
  playlist_id text,
  active_setlist_id text,
  cursor integer not null default 0,
  -- Client side timestamp, kept so conflict resolution matches the offline copy.
  saved_at bigint not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
before update on public.settings
for each row execute function public.touch_updated_at();

alter table public.settings enable row level security;

drop policy if exists settings_own on public.settings;
create policy settings_own on public.settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ——— catalog: shared discovery pool, public data ———
-- Everyone reads it, including signed out visitors. Only the weekly refresh
-- writes, and that runs with the service role key, which bypasses RLS.

create table if not exists public.catalog (
  id text primary key,
  tracks jsonb not null default '[]'::jsonb,
  source text,
  strategy text,
  updated_at timestamptz not null default now()
);

alter table public.catalog enable row level security;

drop policy if exists catalog_readable on public.catalog;
create policy catalog_readable on public.catalog
  for select
  using (true);
