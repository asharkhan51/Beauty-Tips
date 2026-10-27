-- Blogs By Mifrah — Row Level Security
--
-- Model: deny by default. Every table has RLS enabled. A table with no policy
-- for a role is invisible and read-only to that role. Public visitors only ever
-- read published content (and a few public settings); everything else they do
-- (comment, react, subscribe, contact) is done by server routes with the
-- service role after validation and rate limiting.

-- ---------------------------------------------------------------------------
-- More helpers
-- ---------------------------------------------------------------------------
create or replace function public.my_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.staff where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.can_edit_article(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.articles a
      join public.staff s on s.user_id = auth.uid() and s.status = 'active'
     where a.id = target
       and (s.role in ('owner', 'editor') or a.author_id = s.id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Staff guards
-- ---------------------------------------------------------------------------

-- When the owner invites someone who has already signed in with Google before,
-- link them immediately (the signup trigger only fires for brand-new users).
create or replace function public.staff_link_existing_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  u auth.users%rowtype;
begin
  if new.user_id is null then
    select * into u from auth.users
     where lower(email) = lower(new.email::text) and email_confirmed_at is not null
     limit 1;
    if found then
      new.user_id := u.id;
      new.status := 'active';
    end if;
  end if;
  return new;
end;
$$;
create trigger staff_link_existing_bi before insert on public.staff
  for each row execute function public.staff_link_existing_user();

-- The site must always keep at least one active owner.
create or replace function public.staff_protect_last_owner()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and old.role = 'owner' and old.status = 'active'
     and not exists (select 1 from public.staff s
                      where s.role = 'owner' and s.status = 'active' and s.id <> old.id) then
    raise exception 'Cannot remove or demote the last active owner';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger staff_protect_last_owner_bud before update or delete on public.staff
  for each row execute function public.staff_protect_last_owner();

-- Hook the Google sign-in linking trigger (defined in the core schema) up to
-- Supabase Auth's user table.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_staff_on_signup();

-- First-owner bootstrap. Run once, as a database admin (Supabase SQL editor or
-- service role), never from the browser. Refuses to run if an owner exists.
create or replace function public.bootstrap_owner(owner_email text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.staff where role = 'owner' and status in ('invited', 'active')) then
    raise exception 'An owner already exists; use the dashboard to invite people.';
  end if;
  insert into public.staff (email, role, status, can_publish, can_moderate)
  values (owner_email, 'owner', 'invited', true, true);
  return 'Owner invited. Sign in with Google using ' || owner_email || ' to activate.';
end;
$$;
revoke all on function public.bootstrap_owner(text) from public, anon, authenticated;
revoke all on function public.link_staff_on_signup() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.staff               enable row level security;
alter table public.categories          enable row level security;
alter table public.tags                enable row level security;
alter table public.media               enable row level security;
alter table public.articles            enable row level security;
alter table public.article_tags        enable row level security;
alter table public.article_revisions   enable row level security;
alter table public.comments            enable row level security;
alter table public.comment_reports     enable row level security;
alter table public.reactions           enable row level security;
alter table public.subscribers         enable row level security;
alter table public.subscriber_tokens   enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.contact_messages    enable row level security;
alter table public.site_settings       enable row level security;
alter table public.audit_events        enable row level security;

-- Defence in depth: strip direct table access from the browser roles on
-- everything that must never be read or written publicly.
revoke all on public.staff, public.comments, public.comment_reports, public.reactions,
              public.subscribers, public.subscriber_tokens, public.newsletter_campaigns,
              public.contact_messages, public.audit_events, public.article_revisions
  from anon;
revoke all on public.subscriber_tokens, public.reactions from authenticated;

-- ---------------------------------------------------------------------------
-- staff: you can see your own row; only the owner can change anything.
-- (Nobody can promote themselves: there is no self-update policy.)
-- ---------------------------------------------------------------------------
create policy staff_select_self_or_owner on public.staff
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner());
create policy staff_owner_insert on public.staff
  for insert to authenticated with check (public.is_owner());
create policy staff_owner_update on public.staff
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy staff_owner_delete on public.staff
  for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Taxonomy: public read; editors/owner manage; any staff may add tags.
-- ---------------------------------------------------------------------------
create policy categories_public_read on public.categories for select using (true);
create policy categories_editor_write on public.categories
  for all to authenticated
  using (public.is_editor_or_owner()) with check (public.is_editor_or_owner());

create policy tags_public_read on public.tags for select using (true);
create policy tags_staff_insert on public.tags
  for insert to authenticated with check (public.is_staff());
create policy tags_editor_update on public.tags
  for update to authenticated
  using (public.is_editor_or_owner()) with check (public.is_editor_or_owner());
create policy tags_editor_delete on public.tags
  for delete to authenticated using (public.is_editor_or_owner());

-- ---------------------------------------------------------------------------
-- Articles
--  * public: published or scheduled-and-due (published_at <= now()). A scheduled
--    article becomes visible at exactly its time; no cron job is needed for
--    visibility. Drafts and not-yet-due posts are never public.
--  * writers: only their own articles; editors/owner: all.
--  * moving an article out of 'draft' requires publish permission.
--  * delete: owner only.
-- ---------------------------------------------------------------------------
create policy articles_public_read on public.articles
  for select
  using (status in ('published', 'scheduled') and published_at <= now());

create policy articles_staff_read on public.articles
  for select to authenticated
  using (public.can_edit_article(id));

create policy articles_staff_insert on public.articles
  for insert to authenticated
  with check (
    public.is_staff()
    and (status = 'draft' or public.can_publish())
    and (public.is_editor_or_owner() or author_id = public.my_staff_id())
  );

create policy articles_staff_update on public.articles
  for update to authenticated
  using (public.can_edit_article(id))
  with check (
    public.is_staff()
    and (status = 'draft' or public.can_publish())
    and (public.is_editor_or_owner() or author_id = public.my_staff_id())
  );

create policy articles_owner_delete on public.articles
  for delete to authenticated using (public.is_owner());

-- Tags on an article: visible if the article is; changeable if you can edit it.
create policy article_tags_read on public.article_tags
  for select using (exists (select 1 from public.articles a where a.id = article_id));
create policy article_tags_write on public.article_tags
  for all to authenticated
  using (public.can_edit_article(article_id))
  with check (public.can_edit_article(article_id));

-- Revisions are written by a trigger; staff can read the ones they may edit.
create policy revisions_staff_read on public.article_revisions
  for select to authenticated using (public.can_edit_article(article_id));

-- ---------------------------------------------------------------------------
-- Media metadata
-- ---------------------------------------------------------------------------
create policy media_public_read on public.media
  for select using (bucket = 'public-media');
create policy media_staff_read on public.media
  for select to authenticated using (public.is_staff());
create policy media_staff_insert on public.media
  for insert to authenticated with check (public.is_staff());
create policy media_staff_update on public.media
  for update to authenticated
  using (public.is_editor_or_owner() or uploaded_by = public.my_staff_id())
  with check (public.is_editor_or_owner() or uploaded_by = public.my_staff_id());
create policy media_staff_delete on public.media
  for delete to authenticated
  using (public.is_editor_or_owner() or uploaded_by = public.my_staff_id());

-- ---------------------------------------------------------------------------
-- Comments & reports: moderators only. Visitors submit through the server and
-- read approved comments through the public_comments view (no email column).
-- ---------------------------------------------------------------------------
create policy comments_moderator_read on public.comments
  for select to authenticated using (public.can_moderate());
create policy comments_moderator_update on public.comments
  for update to authenticated
  using (public.can_moderate()) with check (public.can_moderate());
create policy comments_moderator_delete on public.comments
  for delete to authenticated using (public.can_moderate());

create policy reports_moderator_all on public.comment_reports
  for all to authenticated
  using (public.can_moderate()) with check (public.can_moderate());

-- reactions & subscriber_tokens: no policies at all (service role only).

-- ---------------------------------------------------------------------------
-- Subscribers and contact messages: owner only. Editors cannot see them.
-- ---------------------------------------------------------------------------
create policy subscribers_owner_all on public.subscribers
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy contact_owner_read on public.contact_messages
  for select to authenticated using (public.is_owner());
create policy contact_owner_delete on public.contact_messages
  for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Newsletter campaigns: drafting by editors/owner. (Actual sending is gated
-- to the owner inside the server route.)
-- ---------------------------------------------------------------------------
create policy campaigns_editor_read on public.newsletter_campaigns
  for select to authenticated using (public.is_editor_or_owner());
create policy campaigns_editor_insert on public.newsletter_campaigns
  for insert to authenticated with check (public.is_editor_or_owner());
create policy campaigns_editor_update on public.newsletter_campaigns
  for update to authenticated
  using (public.is_editor_or_owner() and status in ('draft', 'scheduled'))
  with check (public.is_editor_or_owner());
create policy campaigns_owner_delete on public.newsletter_campaigns
  for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Site settings: public ones are readable by everyone; owner reads/writes all;
-- editors may change public (non-secret) settings only. Secrets belong in
-- environment variables, never here.
-- ---------------------------------------------------------------------------
create policy settings_public_read on public.site_settings
  for select using (is_public);
create policy settings_owner_all on public.site_settings
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy settings_editor_public_write on public.site_settings
  for update to authenticated
  using (public.is_editor_or_owner() and is_public)
  with check (public.is_editor_or_owner() and is_public);

-- ---------------------------------------------------------------------------
-- Audit log: owner can read. Rows are written by the server (service role).
-- ---------------------------------------------------------------------------
create policy audit_owner_read on public.audit_events
  for select to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Public views: grant only what the website needs.
-- ---------------------------------------------------------------------------
grant select on public.public_comments, public.article_reaction_counts,
                public.article_popularity to anon, authenticated;
