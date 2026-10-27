-- Blogs By Mifrah — demo seed. Safe to re-run. Contains NO engagement data and
-- NO personal stories: the nine articles are DRAFT OUTLINES (is_demo = true) for
-- Mifrah to write herself. They stay private until she edits and publishes them.

insert into public.categories (slug, name, description, sort_order) values
  ('beauty-skincare-self-care', 'Beauty, Skincare & Self-Care', 'Gentle routines, honest label-reading and rituals that fit real life.', 1),
  ('lifestyle-daily-life', 'Lifestyle & Daily Life', 'Making ordinary days feel a little more intentional.', 2),
  ('motivation-personal-growth', 'Motivation & Personal Growth', 'Small habits, realistic goals and progress without comparison.', 3)
on conflict (slug) do nothing;

insert into public.tags (slug, name) values
  ('skincare','Skincare'),('routine','Routine'),('self-care','Self-care'),('beauty','Beauty'),
  ('ingredients','Ingredients'),('daily-life','Daily life'),('intentional-living','Intentional living'),
  ('inspiration','Inspiration'),('confidence','Confidence'),('habits','Habits'),
  ('goals','Goals'),('reflection','Reflection')
on conflict (slug) do nothing;

-- title | slug | category | subtitle | tags | outline sections
drop table if exists pg_temp.demo_articles;
create temp table demo_articles (slug text, title text, cat text, subtitle text, excerpt text, tags text[], outline text);
insert into demo_articles values
('a-simple-skincare-routine-draft','Building a simple, consistent skincare routine','beauty-skincare-self-care',
 'DRAFT OUTLINE — working title','Outline: what a basic routine needs and how to keep it going.',
 array['skincare','routine','beauty'],
 E'> **Demo draft outline — replace with your own words.** General information only, not medical advice.\n\n## Introduction\n_Your angle: why simple routines are easier to keep._\n\n## The basics most routines share\n_Cleanse, moisturise, sun protection — explain each in your own words. Cite sources for any claims._\n\n## Making it consistent\n_Habit ideas, when to add a product, when not to._\n\n## When to see a professional\n_A short, honest note that this is general information._\n\n## Sources\n_List any research you use._'),
('a-self-care-ritual-that-fits-real-life-draft','Creating a self-care ritual that fits everyday life','beauty-skincare-self-care',
 'DRAFT OUTLINE — working title','Outline: small rituals that are realistic on a busy day.',
 array['self-care','routine'],
 E'> **Demo draft outline — replace with your own words.**\n\n## What a ritual is (and is not)\n## Choosing something small\n## Anchoring it to your day\n## When a day goes off-plan\n## A closing thought'),
('a-guide-to-reading-skincare-labels-draft','Understanding skincare product labels','beauty-skincare-self-care',
 'DRAFT OUTLINE — working title','Outline: how to read an ingredient list without the jargon.',
 array['skincare','ingredients','beauty'],
 E'> **Demo draft outline — replace with your own words.** Do not present opinions as medical facts; cite sources.\n\n## Why labels feel confusing\n## Reading an ingredient list\n## Common terms explained\n## Marketing claims vs. what a label can tell you\n## Sources'),
('making-ordinary-days-feel-intentional-draft','Making ordinary days feel more intentional','lifestyle-daily-life',
 'DRAFT OUTLINE — working title','Outline: tiny choices that change the feel of a normal day.',
 array['daily-life','intentional-living'],
 E'> **Demo draft outline — replace with your own words.**\n\n## What intentional means to you\n## Morning\n## Midday\n## Evening\n## Keeping it gentle'),
('creating-a-comfortable-personal-routine-draft','Creating a comfortable personal routine','lifestyle-daily-life',
 'DRAFT OUTLINE — working title','Outline: building a routine that supports you instead of pressuring you.',
 array['routine','daily-life','habits'],
 E'> **Demo draft outline — replace with your own words.**\n\n## Why routines help\n## Start from how you actually live\n## Flexible anchors\n## Adjusting over time'),
('finding-inspiration-in-small-everyday-moments-draft','Finding inspiration in small everyday moments','lifestyle-daily-life',
 'DRAFT OUTLINE — working title','Outline: noticing the small things worth keeping.',
 array['inspiration','daily-life','reflection'],
 E'> **Demo draft outline — replace with your own words.**\n\n## Noticing\n## Collecting small moments\n## Turning them into creative fuel\n## A prompt for the week'),
('building-confidence-through-manageable-habits-draft','Building confidence through manageable habits','motivation-personal-growth',
 'DRAFT OUTLINE — working title','Outline: confidence as something practised in small steps.',
 array['confidence','habits'],
 E'> **Demo draft outline — replace with your own words.**\n\n## Confidence as a skill\n## Choosing one small habit\n## Tracking without pressure\n## When motivation dips'),
('setting-gentle-realistic-personal-goals-draft','Setting gentle, realistic personal goals','motivation-personal-growth',
 'DRAFT OUTLINE — working title','Outline: goals that stretch you without overwhelming you.',
 array['goals','habits'],
 E'> **Demo draft outline — replace with your own words.**\n\n## What makes a goal gentle\n## Sizing a goal\n## Checking in\n## Adjusting without guilt'),
('reflecting-on-progress-without-comparing-draft','Reflecting on progress without comparing yourself to others','motivation-personal-growth',
 'DRAFT OUTLINE — working title','Outline: measuring growth against your own past.',
 array['reflection','confidence','goals'],
 E'> **Demo draft outline — replace with your own words.**\n\n## Why comparison is so easy\n## A personal progress review\n## Journalling prompts\n## Closing note');

insert into public.articles (slug, title, subtitle, excerpt, content_md, category_id, status, is_demo)
select d.slug, d.title, d.subtitle, d.excerpt, d.outline,
       (select id from public.categories where slug = d.cat), 'draft', true
  from demo_articles d
on conflict (slug) do nothing;

insert into public.article_tags (article_id, tag_id)
select a.id, t.id
  from demo_articles d
  join public.articles a on a.slug = d.slug
  join public.tags t on t.slug = any (d.tags)
on conflict do nothing;

-- Public, editable site content. No invented biography or social handles.
insert into public.site_settings (key, value, is_public) values
  ('site.tagline',  '"Your little corner of beauty, growth, and everyday life."', true),
  ('site.instagram_url', '""', true),
  ('about.intro',   '"Hi — this page is waiting for Mifrah''s own words. Edit it from the dashboard."', true),
  ('newsletter.guide_title', '"Mini Beauty & Skincare Guide"', true)
on conflict (key) do nothing;

drop table if exists pg_temp.demo_articles;
