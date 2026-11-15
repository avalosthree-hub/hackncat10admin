-- Aggregate private RSVPs only after verifying institution administrator access.
-- Rank before pagination, exposing counts but never student identities.
create function public.admin_derived_event_queue(
 p_institution uuid, p_search text default '', p_list uuid default null, p_page integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_institution_admin(p_institution) then
  raise exception 'Administrator required' using errcode='42501';
 end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page';end if;
 with candidates as materialized (
  select e as event, count(r.user_id) filter(where r.status='going') as going,
   count(r.user_id) filter(where r.status='interested') as interested,
   count(r.user_id) filter(where r.status='not_going') as not_going
  from public.events e left join public.event_rsvps r on r.event_id=e.id
  where e.institution_id=p_institution and e.source_type='derived'
   and (p_list is null or e.list_id=p_list)
   and (coalesce(btrim(p_search),'')='' or strpos(lower(e.title),lower(btrim(p_search)))>0)
  group by e.id
 ), ranked as (
  select *, row_number() over(order by (going+interested) desc, going desc, (event).starts_at asc nulls last, (event).id) as rank
  from candidates
 ), page as (
  select * from ranked order by rank limit 12 offset p_page*12
 )
 select jsonb_build_object(
  'events',coalesce((select jsonb_agg(to_jsonb(event) order by rank) from page),'[]'::jsonb),
  'metrics',coalesce((select jsonb_agg(jsonb_build_object('event_id',(event).id,'going',going,'interested',interested,'not_going',not_going) order by rank) from page),'[]'::jsonb),
  'total',(select count(*) from candidates)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_derived_event_queue(uuid,text,uuid,integer) from public,anon;
grant execute on function public.admin_derived_event_queue(uuid,text,uuid,integer) to authenticated;
