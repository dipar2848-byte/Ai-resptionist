-- ─────────────────────────────────────────────────────────────
-- Supabase schema for AI Voice Receptionist (optional persistence)
-- Run this in the Supabase SQL editor if you set SUPABASE_URL +
-- SUPABASE_SERVICE_ROLE_KEY. Without these, the in-memory store is used.
-- ─────────────────────────────────────────────────────────────

-- Per-call session state (keyed by sess:<client_id>:<callSid>)
create table if not exists public.sessions (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz,
  updated_at  timestamptz default now()
);

create index if not exists sessions_expires_at_idx on public.sessions (expires_at);

-- Booking records (mock integration target)
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null,
  call_sid    text,
  name        text,
  service     text,
  datetime    text,
  status      text default 'confirmed',
  created_at  timestamptz default now()
);

create index if not exists bookings_client_id_idx on public.bookings (client_id);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);

-- The service role key bypasses RLS, which is what the server uses. If you want
-- to expose these via anon clients, add appropriate RLS policies below.
-- alter table public.sessions enable row level security;
-- alter table public.bookings enable row level security;
