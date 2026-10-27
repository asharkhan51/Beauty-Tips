-- Blogs By Mifrah — core schema
-- Everything private is deny-by-default (see the RLS migration). Public visitors
-- never write directly to the database: comments, reactions, subscriptions and
-- contact messages go through server routes that use the service role after
-- validation, spam checks and rate limiting.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'editor', 'writer');
create type public.staff_status as enum ('invited', 'active', 'removed');
create type public.article_status as enum ('draft', 'scheduled', 'published');
create type public.comment_status as enum ('pending', 'approved', 'rejected');
create type public.reaction_kind as enum ('love', 'helpful', 'inspiring', 'relatable');
create type public.subscriber_status as enum ('pending', 'confirmed', 'unsubscribed');
create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff (the invite/allowlist). Signing in with Google does NOT grant access;
-- a row here with a matching verified email does.
-- ---------------------------------------------------------------------------
create table public.staff (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  email         citext not null unique,
  display_name  text,
  role          public.staff_role not null default 'writer',
  status        public.staff_status not null default 'invited',
  can_publish   boolean not null default false,
  can_moderate  boolean not null default false,
  invited_by    uuid references public.staff(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint staff_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

-- Link a first-time Google sign-in to an invitation. Only a *verified* email
-- matching an invited/active row is linked; everyone else gets no staff row
-- and therefore no access.
create or replace function public.link_staff_on_signup()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.staff
       set user_id = new.id,
           status = 'active',
           display_name = coalesce(display_name, new.raw_user_meta_data ->> 'full_name')
     where email = new.email::citext
       and status in ('invited', 'active')
       and user_id is null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer so policies can call them without
-- recursing into staff's own RLS). They only ever look at auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns public.staff_role language sql stable security definer set search_path = public as $$
  select role from public.staff
   where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and status = 'active')
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff
                  where user_id = auth.uid() and status = 'active' and role = 'owner')
$$;

create or replace function public.can_publish()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff
                  where user_id = auth.uid() and status = 'active'
                    and (role = 'owner' or can_publish))
$$;

create or replace function public.can_moderate()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff
                  where user_id = auth.uid() and status = 'active'
                    and (role = 'owner' or can_moderate))
$$;

-- Editors manage content; writers only their own drafts.
create or replace function public.is_editor_or_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff
                  where user_id = auth.uid() and status = 'active'
                    and role in ('owner', 'editor'))
$$;

-- ---------------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- ---------------------------------------------------------------------------
-- Media metadata (files live in Supabase Storage)
-- ---------------------------------------------------------------------------
create table public.media (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null default 'public-media',
  path         text not null,
  alt_text     text,
  width        int,
  height       int,
  mime_type    text not null,
  size_bytes   bigint not null,
  credit       text,          -- photographer / licence attribution
  source_url   text,
  uploaded_by  uuid references public.staff(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, path),
  constraint media_mime_allowed check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint media_size_limit check (size_bytes > 0 and size_bytes <= 5242880)
);

-- ---------------------------------------------------------------------------
-- Articles
-- ---------------------------------------------------------------------------
create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  subtitle         text,
  excerpt          text,
  content_md       text not null default '',
  author_note      text,                       -- optional personal note, written by Mifrah
  cover_media_id   uuid references public.media(id) on delete set null,
  cover_alt        text,
  category_id      uuid references public.categories(id) on delete restrict,
  author_id        uuid references public.staff(id) on delete set null,
  status           public.article_status not null default 'draft',
  is_demo          boolean not null default false,   -- clearly labelled starter content
  published_at     timestamptz,                -- when it becomes public (future = scheduled)
  seo_title        text,
  seo_description  text,
  reading_minutes  int not null default 1,
  revision_number  int not null default 1,     -- optimistic concurrency token
  search_vector    tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint articles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint articles_title_length check (char_length(title) between 1 and 200),
  constraint articles_seo_title_length check (seo_title is null or char_length(seo_title) <= 70),
  constraint articles_seo_desc_length check (seo_description is null or char_length(seo_description) <= 200),
  constraint articles_publish_needs_date check (
    status = 'draft' or published_at is not null
  )
);
create index articles_public_idx on public.articles (published_at desc)
  where status in ('published', 'scheduled');
create index articles_category_idx on public.articles (category_id);
create index articles_search_idx on public.articles using gin (search_vector);

create table public.article_tags (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);
create index article_tags_tag_idx on public.article_tags (tag_id);

-- Reading time and full-text vector are derived from the real content, always.
create or replace function public.articles_derive()
returns trigger language plpgsql as $$
declare
  words int;
begin
  words := coalesce(array_length(regexp_split_to_array(trim(new.content_md), '\s+'), 1), 0);
  if trim(new.content_md) = '' then words := 0; end if;
  new.reading_minutes := greatest(1, ceil(words / 200.0)::int);
  new.search_vector :=
      setweight(to_tsvector('english', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('english', coalesce(new.subtitle, '') || ' ' || coalesce(new.excerpt, '')), 'B')
   || setweight(to_tsvector('english', coalesce(new.content_md, '')), 'C');
  return new;
end;
$$;
create trigger articles_derive_biu before insert or update of title, subtitle, excerpt, content_md
  on public.articles for each row execute function public.articles_derive();

create trigger articles_updated_at before update on public.articles
  for each row execute function public.set_updated_at();

-- Optimistic concurrency: every content edit bumps revision_number. Clients
-- send the number they loaded; the server rejects a stale write.
create or replace function public.articles_bump_revision()
returns trigger language plpgsql as $$
begin
  if (new.title, new.subtitle, new.excerpt, new.content_md, new.author_note, new.seo_title, new.seo_description)
     is distinct from
     (old.title, old.subtitle, old.excerpt, old.content_md, old.author_note, old.seo_title, old.seo_description) then
    new.revision_number := old.revision_number + 1;
  end if;
  return new;
end;
$$;
create trigger articles_bump_revision_bu before update on public.articles
  for each row execute function public.articles_bump_revision();

-- ---------------------------------------------------------------------------
-- Revision history. A snapshot of the row is stored after every content change,
-- so restoring an old version simply writes it back — which itself creates a
-- new snapshot, so nothing is silently destroyed.
-- ---------------------------------------------------------------------------
create table public.article_revisions (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid not null references public.articles(id) on delete cascade,
  revision_number int not null,
  title           text not null,
  subtitle        text,
  excerpt         text,
  content_md      text not null,
  author_note     text,
  seo_title       text,
  seo_description text,
  edited_by       uuid references public.staff(id) on delete set null,
  note            text,   -- e.g. 'restored from revision 4'
  created_at      timestamptz not null default now(),
  unique (article_id, revision_number)
);

create or replace function public.articles_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  editor uuid;
begin
  select id into editor from public.staff where user_id = auth.uid() and status = 'active';
  insert into public.article_revisions
    (article_id, revision_number, title, subtitle, excerpt, content_md, author_note,
     seo_title, seo_description, edited_by)
  values
    (new.id, new.revision_number, new.title, new.subtitle, new.excerpt, new.content_md,
     new.author_note, new.seo_title, new.seo_description, editor)
  on conflict (article_id, revision_number) do nothing;
  return new;
end;
$$;
create trigger articles_snapshot_ai after insert on public.articles
  for each row execute function public.articles_snapshot();
create trigger articles_snapshot_au after update on public.articles
  for each row when (old.revision_number is distinct from new.revision_number)
  execute function public.articles_snapshot();

-- ---------------------------------------------------------------------------
-- Comments (guest, moderated) and reports
-- ---------------------------------------------------------------------------
create table public.comments (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid not null references public.articles(id) on delete cascade,
  display_name  text not null,
  email         citext not null,          -- never exposed publicly
  body          text not null,
  status        public.comment_status not null default 'pending',
  moderated_by  uuid references public.staff(id) on delete set null,
  moderated_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint comments_name_length check (char_length(display_name) between 1 and 60),
  constraint comments_body_length check (char_length(body) between 2 and 2000),
  constraint comments_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create index comments_article_idx on public.comments (article_id, created_at)
  where status = 'approved';
create index comments_pending_idx on public.comments (created_at) where status = 'pending';

create table public.comment_reports (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  reason      text not null,
  reporter_hash text,                      -- salted hash, not an identity
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint comment_reports_reason_length check (char_length(reason) between 3 and 500)
);

-- ---------------------------------------------------------------------------
-- Reactions. One row per (article, kind, voter_hash). voter_hash is an HMAC of
-- a random per-browser id plus a server secret: it limits casual repeats without
-- storing anything that identifies a person. Clearing browser storage allows
-- a repeat reaction — this is a deliberate, documented limitation.
-- ---------------------------------------------------------------------------
create table public.reactions (
  article_id uuid not null references public.articles(id) on delete cascade,
  kind       public.reaction_kind not null,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  primary key (article_id, kind, voter_hash)
);

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------
create table public.subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           citext not null unique,
  status          public.subscriber_status not null default 'pending',
  preferences     jsonb not null default '{"weekly": true, "monthly_roundup": true}'::jsonb,
  unsubscribe_token_hash text not null,     -- SHA-256 of the token in email links
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  guide_sent_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint subscribers_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint subscribers_confirmed_has_date check (status <> 'confirmed' or confirmed_at is not null)
);
create trigger subscribers_updated_at before update on public.subscribers
  for each row execute function public.set_updated_at();

-- Only hashes are stored; the raw token exists solely in the email link.
create table public.subscriber_tokens (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  token_hash    text not null unique,
  purpose       text not null default 'confirm' check (purpose in ('confirm')),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index subscriber_tokens_sub_idx on public.subscriber_tokens (subscriber_id);

create table public.newsletter_campaigns (
  id            uuid primary key default gen_random_uuid(),
  subject       text not null,
  preheader     text,
  body_md       text not null default '',
  status        public.campaign_status not null default 'draft',
  scheduled_for timestamptz,
  provider_ref  text,                 -- id returned by the email provider
  last_error    text,
  sent_at       timestamptz,
  created_by    uuid references public.staff(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger campaigns_updated_at before update on public.newsletter_campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contact messages, site settings, audit log
-- ---------------------------------------------------------------------------
create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      citext not null,
  subject    text not null,
  message    text not null,
  delivered  boolean not null default false,   -- true only when the provider confirmed
  created_at timestamptz not null default now(),
  constraint contact_message_length check (char_length(message) between 5 and 4000)
);

-- Editable site content (About page text, Instagram URL, guide settings...).
create table public.site_settings (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.staff(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_created_idx on public.audit_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Safe public views. These run with the view owner's rights, so they can read
-- private tables — but they expose only the columns listed here.
-- ---------------------------------------------------------------------------
create view public.public_comments as
  select id, article_id, display_name, body, created_at
    from public.comments
   where status = 'approved';

create view public.article_reaction_counts as
  select article_id, kind, count(*)::int as total
    from public.reactions
   group by article_id, kind;

-- "Most popular" = reactions + 2 × approved comments, per article. It is built
-- only from engagement readers chose to give; no page-view tracking exists.
create view public.article_popularity as
  select a.id as article_id,
         coalesce(r.total, 0) + 2 * coalesce(c.total, 0) as score
    from public.articles a
    left join (select article_id, count(*) as total from public.reactions group by article_id) r
           on r.article_id = a.id
    left join (select article_id, count(*) as total from public.comments
                where status = 'approved' group by article_id) c
           on c.article_id = a.id
   where a.status in ('published', 'scheduled') and a.published_at <= now();
