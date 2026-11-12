-- WCR emailer V1 schema. Run once against the DATABASE_URL in use.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed', 'bounced', 'complained')),
  first_name text,
  tags text[] not null default '{}',
  source text,
  song text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  consent_text text,
  consent_ip text,
  consent_user_agent text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz
);

create table if not exists campaigns (
  id text primary key,
  subject text not null,
  segment text not null default 'all',
  send_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'canceled')),
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- kind: campaign | release (from markdown files) | wiw_episode | wiw_digest | video (automatic).
-- ref: what an automatic email is about (episode number, video id, digest week).
alter table campaigns add column if not exists kind text not null default 'campaign';
alter table campaigns add column if not exists ref text;
-- Automatic emails have no markdown file, so their rendered body and
-- frontmatter are stored here; a retry after a crash resends the same email.
alter table campaigns add column if not exists content jsonb;

create table if not exists sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id text references campaigns(id),
  sequence_step text,
  subscriber_id uuid not null references subscribers(id),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'bounced', 'complained')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sends_campaign_subscriber_unique unique (campaign_id, subscriber_id),
  constraint sends_sequence_subscriber_unique unique (sequence_step, subscriber_id)
);

create table if not exists events (
  id bigserial primary key,
  subscriber_id uuid references subscribers(id),
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists subscribers_status_idx on subscribers (status);
create index if not exists subscribers_tags_idx on subscribers using gin (tags);
create index if not exists sends_campaign_idx on sends (campaign_id);
create index if not exists sends_sequence_idx on sends (sequence_step);
create index if not exists events_subscriber_idx on events (subscriber_id);
