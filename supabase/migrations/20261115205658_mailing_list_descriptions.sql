alter table public.list add column description text
 constraint list_description_length check(char_length(description)<=1000);
grant select(description),insert(description),update(description) on public.list to authenticated;
-- Existing institution-admin mutation policies and student SELECT policies remain authoritative.
