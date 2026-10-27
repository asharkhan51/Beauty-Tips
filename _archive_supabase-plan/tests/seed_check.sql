\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
\i supabase/seed.sql
\i supabase/seed.sql
select 'categories='||count(*) from public.categories;
select 'demo_articles='||count(*) from public.articles where is_demo and status='draft';
select 'per_category='||string_agg(c::text, ',' order by c) from (select count(*) c from public.articles group by category_id) x;
select 'untagged='||count(*) from public.articles a where not exists (select 1 from public.article_tags t where t.article_id=a.id);
select 'public_readable_demo='||count(*) from public.articles where status<>'draft';
rollback;
