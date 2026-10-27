-- Blogs By Mifrah — Storage buckets and policies
--
-- public-media  : images shown on the website. Anyone can *read* a file if they
--                 know its URL; only signed-in staff can upload or change files.
-- private-media : not public. Holds the subscriber guide PDF. The server hands
--                 out short-lived signed links only after email confirmation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('private-media', 'private-media', false, 15728640,
   array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- public-media: staff can list/upload; editors/owner (or the uploader) can change.
create policy "public-media staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'public-media' and public.is_staff());

create policy "public-media staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'public-media' and public.is_staff());

create policy "public-media editor update" on storage.objects
  for update to authenticated
  using (bucket_id = 'public-media' and (public.is_editor_or_owner() or owner = auth.uid()))
  with check (bucket_id = 'public-media' and (public.is_editor_or_owner() or owner = auth.uid()));

create policy "public-media editor delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'public-media' and (public.is_editor_or_owner() or owner = auth.uid()));

-- private-media: editors/owner only. Visitors never touch this bucket directly.
create policy "private-media editor all" on storage.objects
  for all to authenticated
  using (bucket_id = 'private-media' and public.is_editor_or_owner())
  with check (bucket_id = 'private-media' and public.is_editor_or_owner());
