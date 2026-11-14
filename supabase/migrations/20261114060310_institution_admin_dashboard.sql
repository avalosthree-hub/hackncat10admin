-- Additive dashboard RPCs for the existing Aggie Fetch schema and private role helpers.
-- No policies, roles, historical posts, or existing table grants are replaced.
create or replace function public.admin_dashboard_counts(p_institution uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_institution_admin(p_institution) then
    raise exception 'Institution administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'lists', (select count(*) from public.list l where l.institution = p_institution),
    'senders', (select count(*) from public.list_senders s join public.list l on l.id = s.list_id where l.institution = p_institution),
    'administrators', (select count(*) from public.institution_admins a where a.institution_id = p_institution)
  );
end;
$$;

create or replace function public.admin_institution_roster(p_institution uuid)
returns table(user_id uuid, institution_id uuid, role text, email text, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_institution_owner(p_institution) then
    raise exception 'Institution owner access required' using errcode = '42501';
  end if;
  return query
    select a.user_id, a.institution_id, a.role, au.email::text, a.created_at
    from public.institution_admins a
    join public.users u on u.id = a.user_id
    join auth.users au on au.id = u.auth_id
    where a.institution_id = p_institution
    order by (a.role = 'owner') desc, au.email;
end;
$$;

-- Atomic assignment avoids returning a searchable directory of registered users.
-- A missing email and an account from another institution produce the same error.
create or replace function public.assign_institution_admin_by_email(p_institution uuid, p_email text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target_id uuid;
  normalized_email text := lower(btrim(p_email));
begin
  if auth.uid() is null or not private.is_institution_owner(p_institution) then
    raise exception 'Institution owner access required' using errcode = '42501';
  end if;
  if normalized_email is null or length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid university email address' using errcode = '22023';
  end if;
  -- Lock the owner assignment against concurrent removal during this operation.
  perform 1 from public.institution_admins a join public.users u on u.id = a.user_id
  where a.institution_id = p_institution and a.role = 'owner' and u.auth_id = auth.uid()
  for share of a;
  if not found then
    raise exception 'Institution owner access required' using errcode = '42501';
  end if;
  select u.id into target_id from public.users u
  join auth.users au on au.id = u.auth_id
  where lower(au.email) = normalized_email and u.institution_id = p_institution
  for share of u;
  if target_id is null then
    raise exception 'No eligible registered account found in this institution' using errcode = 'P0001';
  end if;
  if not private.can_assign_institution_admin(target_id, p_institution) then
    raise exception 'Institution owner access required' using errcode = '42501';
  end if;
  insert into public.institution_admins (user_id, institution_id, role)
  values (target_id, p_institution, 'admin');
end;
$$;

revoke all on function public.admin_dashboard_counts(uuid) from public, anon;
revoke all on function public.admin_institution_roster(uuid) from public, anon;
revoke all on function public.assign_institution_admin_by_email(uuid, text) from public, anon;
grant execute on function public.admin_dashboard_counts(uuid) to authenticated;
grant execute on function public.admin_institution_roster(uuid) to authenticated;
grant execute on function public.assign_institution_admin_by_email(uuid, text) to authenticated;
