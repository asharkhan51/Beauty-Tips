-- Permission and schema tests. Run with: bash supabase/tests/run_local_db_tests.sh
-- Each check prints PASS/FAIL; any FAIL makes the script exit non-zero.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create schema t;
grant usage on schema t to public;
create table t.results (name text, ok boolean, detail text);
grant all on t.results to public;

create function t.check(name text, ok boolean, detail text default '') returns void
language plpgsql as $$ begin insert into t.results values (name, coalesce(ok, false), detail); end; $$;

-- Switch identity the way Supabase does: a role plus the signed-in user's id.
create function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;
end; $$;
create function t.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end; $$;
create function t.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end; $$;

-- Count rows a query returns under the current identity (permission error => -1).
create function t.cnt(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') s' into n; return n;
exception when insufficient_privilege then return -1; end; $$;

-- Run a write; report 'denied' (error), or the number of rows it changed.
create function t.try(q text) returns text language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n::text;
exception when insufficient_privilege or check_violation or raise_exception
                or unique_violation or not_null_violation or foreign_key_violation then return 'denied';
end; $$;

begin;

-- ===== Fixtures (as database admin) =======================================
create temp table ids (k text primary key, v uuid);
insert into ids select k, gen_random_uuid() from unnest(array['owner','editor','writer','writer2','stranger']) k;
create function t.id(k text) returns uuid language sql as $$ select v from ids where k = $1 $$;
grant select on ids to public;

select public.bootstrap_owner('owner@example.test');
select t.check('bootstrap refuses a second owner',
  t.try($$select public.bootstrap_owner('second@example.test')$$) = 'denied');

-- Google sign-ins arrive. Only the invited, verified email is linked.
insert into auth.users (id, email, email_confirmed_at) values
  (t.id('owner'),    'owner@example.test',    now()),
  (t.id('stranger'), 'stranger@example.test', now());
select t.check('invited owner is linked on first sign-in',
  (select status::text from public.staff where email = 'owner@example.test') = 'active');
select t.check('uninvited Google account gets no staff row',
  not exists (select 1 from public.staff where user_id = t.id('stranger')));

-- Owner invites an editor and two writers through normal RLS.
insert into auth.users (id, email, email_confirmed_at) values
  (t.id('editor'), 'editor@example.test', now()),
  (t.id('writer'), 'writer@example.test', now()),
  (t.id('writer2'), 'writer2@example.test', now());
select t.as_user(t.id('owner'));
select t.check('owner can invite staff',
  t.try($$insert into public.staff (email, role) values ('editor@example.test','editor')$$) = '1'
  and t.try($$insert into public.staff (email, role) values ('writer@example.test','writer')$$) = '1'
  and t.try($$insert into public.staff (email, role) values ('writer2@example.test','writer')$$) = '1');
select t.as_admin();
select t.check('existing Google users are linked at invite time',
  (select count(*) from public.staff where status = 'active') = 4);

insert into public.categories (slug, name) values ('beauty', 'Beauty, Skincare & Self-Care');
create temp table art (k text primary key, v uuid);
grant select on art to public;
insert into art select k, gen_random_uuid() from unnest(array['pub','draft','future','due','w1draft','w2draft']) k;
create function t.art(k text) returns uuid language sql as $$ select v from art where k = $1 $$;

insert into public.articles (id, slug, title, status, published_at, content_md, author_id) values
  (t.art('pub'),    'published-one', 'Published', 'published', now() - interval '1 day', 'hello world', null),
  (t.art('draft'),  'a-draft',       'Draft',     'draft',     null, 'secret', null),
  (t.art('future'), 'future-post',   'Future',    'scheduled', now() + interval '1 day', 'later', null),
  (t.art('due'),    'due-post',      'Due',       'scheduled', now() - interval '1 minute', 'now live', null);
insert into public.articles (id, slug, title, status, content_md, author_id) values
  (t.art('w1draft'), 'w1-draft', 'W1', 'draft', 'mine',
     (select id from public.staff where email = 'writer@example.test')),
  (t.art('w2draft'), 'w2-draft', 'W2', 'draft', 'theirs',
     (select id from public.staff where email = 'writer2@example.test'));

insert into public.comments (article_id, display_name, email, body, status) values
  (t.art('pub'), 'Approved Ann', 'ann@example.test', 'Lovely post', 'approved'),
  (t.art('pub'), 'Pending Pat',  'pat@example.test', 'Awaiting review', 'pending');
insert into public.subscribers (email, status, confirmed_at, unsubscribe_token_hash)
  values ('reader@example.test', 'confirmed', now(), 'hash');
insert into public.reactions values (t.art('pub'), 'love', 'voter1'), (t.art('pub'), 'love', 'voter2');

-- ===== Anonymous visitor ===================================================
select t.as_anon();
select t.check('anon sees published + due-scheduled only',
  t.cnt('select 1 from public.articles') = 2, 'got ' || t.cnt('select 1 from public.articles'));
select t.check('anon cannot see the draft by id',
  t.cnt($$select 1 from public.articles where status = 'draft'$$) = 0);
select t.check('anon cannot see the future scheduled post',
  t.cnt($$select 1 from public.articles where slug = 'future-post'$$) = 0);
select t.check('anon cannot read comments table', t.cnt('select 1 from public.comments') = -1);
select t.check('anon cannot read subscribers', t.cnt('select 1 from public.subscribers') = -1);
select t.check('anon cannot read staff', t.cnt('select 1 from public.staff') = -1);
select t.check('anon cannot read reactions rows', t.cnt('select 1 from public.reactions') = -1);
select t.check('anon cannot read audit log', t.cnt('select 1 from public.audit_events') = -1);
select t.check('public_comments shows only approved',
  t.cnt('select 1 from public.public_comments') = 1);
select t.check('public_comments exposes no email column',
  not exists (select 1 from information_schema.columns
               where table_name = 'public_comments' and column_name = 'email'));
select t.check('reaction counts are readable and accurate',
  (select total from public.article_reaction_counts where kind = 'love') = 2);
select t.check('anon cannot insert articles',
  t.try($$insert into public.articles (slug, title) values ('x', 'x')$$) = 'denied');
select t.check('anon cannot post a comment directly',
  t.try($$insert into public.comments (article_id, display_name, email, body)
          values ((select id from public.articles limit 1), 'a', 'a@b.co', 'hi there')$$) = 'denied');
select t.check('anon cannot approve comments',
  t.try($$update public.comments set status = 'approved'$$) = 'denied');

-- ===== Signed-in but uninvited Google account ==============================
select t.as_user(t.id('stranger'));
select t.check('stranger sees only public articles', t.cnt('select 1 from public.articles') = 2);
select t.check('stranger cannot create a draft',
  t.try($$insert into public.articles (slug, title) values ('s', 's')$$) = 'denied');
select t.check('stranger cannot add themselves to staff',
  t.try($$insert into public.staff (email, role, status, user_id)
          values ('stranger@example.test', 'owner', 'active', t.id('stranger'))$$) = 'denied');
select t.check('stranger cannot read subscribers', t.cnt('select 1 from public.subscribers') = 0);
select t.check('stranger cannot moderate comments',
  t.try($$update public.comments set status = 'approved'$$) = '0');
select t.check('stranger cannot upload to public-media',
  t.try($$insert into storage.objects (bucket_id, name, owner) values ('public-media','x.png', t.id('stranger'))$$) = 'denied');

-- ===== Writer ==============================================================
select t.as_user(t.id('writer'));
select t.check('writer sees public + own draft only', t.cnt('select 1 from public.articles') = 3,
  'got ' || t.cnt('select 1 from public.articles'));
select t.check('writer cannot see another writer''s draft',
  t.cnt($$select 1 from public.articles where slug = 'w2-draft'$$) = 0);
select t.check('writer can create own draft',
  t.try($$insert into public.articles (slug, title, author_id)
          values ('writer-new', 'New', public.my_staff_id())$$) = '1');
select t.check('writer cannot publish without permission',
  t.try($$insert into public.articles (slug, title, status, published_at, author_id)
          values ('writer-pub', 'P', 'published', now(), public.my_staff_id())$$) = 'denied');
select t.check('writer cannot flip own draft to published',
  t.try($$update public.articles set status = 'published', published_at = now() where slug = 'w1-draft'$$) = 'denied');
select t.check('writer cannot edit someone else''s article',
  t.try($$update public.articles set title = 'hacked' where slug in ('w2-draft','published-one')$$) = '0');
select t.check('writer cannot delete articles',
  t.try($$delete from public.articles where slug = 'w1-draft'$$) = '0');
select t.check('writer cannot promote themselves',
  t.try($$update public.staff set role = 'owner', can_publish = true where user_id = auth.uid()$$) = '0');
select t.check('writer sees only their own staff row', t.cnt('select 1 from public.staff') = 1);
select t.check('writer cannot read subscribers', t.cnt('select 1 from public.subscribers') = 0);
select t.check('writer cannot moderate comments',
  t.try($$update public.comments set status = 'approved'$$) = '0');
select t.check('writer cannot read contact messages', t.cnt('select 1 from public.contact_messages') = 0);
select t.check('writer cannot read newsletter campaigns',
  t.cnt('select 1 from public.newsletter_campaigns') = 0);
select t.check('writer can upload to public-media',
  t.try($$insert into storage.objects (bucket_id, name, owner) values ('public-media','w.png', auth.uid())$$) = '1');
select t.check('writer cannot touch private-media',
  t.try($$insert into storage.objects (bucket_id, name, owner) values ('private-media','guide.pdf', auth.uid())$$) = 'denied');

-- ===== Editor ==============================================================
select t.as_admin();
update public.staff set can_publish = true where email = 'editor@example.test';
select t.as_user(t.id('editor'));
select t.check('editor sees all articles incl. drafts', t.cnt('select 1 from public.articles') >= 6);
select t.check('editor can publish',
  t.try($$update public.articles set status = 'published', published_at = now() where slug = 'a-draft'$$) = '1');
select t.check('editor cannot read subscribers', t.cnt('select 1 from public.subscribers') = 0);
select t.check('editor without moderate flag cannot moderate',
  t.try($$update public.comments set status = 'approved'$$) = '0');
select t.check('editor cannot invite staff',
  t.try($$insert into public.staff (email, role) values ('x@example.test','owner')$$) = 'denied');
select t.check('editor cannot delete articles',
  t.try($$delete from public.articles where slug = 'a-draft'$$) = '0');
select t.check('editor can draft newsletter campaigns',
  t.try($$insert into public.newsletter_campaigns (subject) values ('Weekly')$$) = '1');
select t.check('editor can manage private-media',
  t.try($$insert into storage.objects (bucket_id, name, owner) values ('private-media','guide.pdf', auth.uid())$$) = '1');

-- ===== Moderator flag ======================================================
select t.as_admin();
update public.staff set can_moderate = true where email = 'editor@example.test';
select t.as_user(t.id('editor'));
select t.check('moderator can approve a pending comment',
  t.try($$update public.comments set status = 'approved' where display_name = 'Pending Pat'$$) = '1');

-- ===== Owner ===============================================================
select t.as_user(t.id('owner'));
select t.check('owner reads subscribers', t.cnt('select 1 from public.subscribers') = 1);
select t.check('owner can change a role',
  t.try($$update public.staff set role = 'editor' where email = 'writer2@example.test'$$) = '1');
select t.check('owner can delete articles',
  t.try($$delete from public.articles where slug = 'w2-draft'$$) = '1');
select t.check('last owner cannot be demoted',
  t.try($$update public.staff set role = 'writer' where email = 'owner@example.test'$$) = 'denied');
select t.check('last owner cannot be removed',
  t.try($$update public.staff set status = 'removed' where email = 'owner@example.test'$$) = 'denied');

-- ===== Removed collaborator ================================================
select t.as_user(t.id('owner'));
select t.try($$update public.staff set status = 'removed' where email = 'writer@example.test'$$);
select t.as_user(t.id('writer'));
select t.check('removed writer loses draft access immediately',
  t.cnt($$select 1 from public.articles where slug = 'w1-draft'$$) = 0);
select t.check('removed writer cannot create drafts',
  t.try($$insert into public.articles (slug, title) values ('after-removal', 'x')$$) = 'denied');
select t.check('removed writer cannot upload',
  t.try($$insert into storage.objects (bucket_id, name, owner) values ('public-media','late.png', auth.uid())$$) = 'denied');

-- ===== Derived data, revisions, constraints (admin) ========================
select t.as_admin();
insert into public.articles (id, slug, title, content_md, status, published_at)
  values (gen_random_uuid(), 'long-one', 'Long', (select string_agg('word', ' ') from generate_series(1, 450)), 'published', now());
select t.check('reading time is computed from content (450 words = 3 min)',
  (select reading_minutes from public.articles where slug = 'long-one') = 3);
select t.check('empty content still has 1 minute minimum',
  (select reading_minutes from public.articles where slug = 'a-draft' or slug='future-post' limit 1) = 1);
select t.check('full-text vector finds body text',
  (select count(*) from public.articles where search_vector @@ plainto_tsquery('english', 'word')) >= 1);

update public.articles set content_md = 'first edit' where slug = 'published-one';
update public.articles set content_md = 'second edit' where slug = 'published-one';
select t.check('each content edit adds a revision (initial + 2 edits)',
  (select count(*) from public.article_revisions r join public.articles a on a.id = r.article_id
    where a.slug = 'published-one') = 3);
-- Restore revision 1 by writing it back: a new revision appears, nothing is lost.
update public.articles a set content_md = r.content_md
  from public.article_revisions r
 where a.slug = 'published-one' and r.article_id = a.id and r.revision_number = 1;
select t.check('restore creates a new revision instead of deleting history',
  (select count(*) from public.article_revisions r join public.articles a on a.id = r.article_id
    where a.slug = 'published-one') = 4
  and (select content_md from public.articles where slug = 'published-one') = 'hello world');
select t.check('metadata-only edits do not bump revision',
  (select revision_number from public.articles where slug = 'published-one') = 4
  and t.try($$update public.articles set seo_title = null where slug = 'published-one'$$) = '1'
  and (select revision_number from public.articles where slug = 'published-one') = 4);

select t.check('duplicate slug rejected',
  t.try($$insert into public.articles (slug, title) values ('published-one', 'dup')$$) = 'denied');
select t.check('bad slug rejected by constraint',
  t.try($$insert into public.articles (slug, title) values ('Bad Slug!', 'x')$$) = 'denied');
select t.check('published article requires a publish date',
  t.try($$insert into public.articles (slug, title, status) values ('nodate', 'x', 'published')$$) = 'denied');
select t.check('oversize image rejected in media metadata',
  t.try($$insert into public.media (path, mime_type, size_bytes) values ('a.png','image/png', 99999999)$$) = 'denied');
select t.check('non-image mime rejected in media metadata',
  t.try($$insert into public.media (path, mime_type, size_bytes) values ('a.svg','image/svg+xml', 100)$$) = 'denied');
select t.check('popularity = reactions + 2 x approved comments',
  (select score from public.article_popularity p join public.articles a on a.id = p.article_id
    where a.slug = 'published-one') = 6);  -- 2 reactions + 2 x 2 approved comments (Ann; Pat after moderation)

select t.check('RLS enabled on every public table',
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity));

-- Print results before rolling back (the results table is inside the transaction).
select (case when ok then 'PASS ' else 'FAIL ' end) || name ||
       (case when ok or detail = '' then '' else '  [' || detail || ']' end)
  from t.results;
select 'TOTAL ' || count(*) || ' checks, ' || count(*) filter (where not ok) || ' failed' from t.results;

rollback;
