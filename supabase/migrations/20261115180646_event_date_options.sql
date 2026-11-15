-- Store calendar dates separately from instants; never manufacture midnight times.
alter table public.events add column schedule_type text not null default 'timed'
 check(schedule_type in ('timed','all_day','date_only','end_date_only'));
alter table public.events add column event_end_date date;
alter table public.events add constraint events_date_schedule_check check (
 (schedule_type='timed' and event_end_date is null)
 or (schedule_type in ('all_day','date_only','end_date_only') and starts_at is null and ends_at is null
  and event_date is not null and (event_end_date is null or event_end_date>=event_date)
  and (schedule_type<>'end_date_only' or (event_end_date is not null and event_date=event_end_date)))
);

create or replace function private.guard_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare direct_admin boolean := current_setting('role',true) = 'authenticated' and pg_trigger_depth()=1;
begin
 if not exists(select 1 from public.list l where l.id=new.list_id and l.institution=new.institution_id) then raise exception 'Event list must belong to its institution'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone'; end if;
 if tg_op='UPDATE' then
  if (new.id,new.institution_id,new.list_id,new.source_email_post_id,new.source_event_key,new.created_by,new.created_at) is distinct from
     (old.id,old.institution_id,old.list_id,old.source_email_post_id,old.source_event_key,old.created_by,old.created_at) then raise exception 'Event identity, source and institution cannot be changed'; end if;
  if new.source_type is distinct from old.source_type and not (
   direct_admin and private.is_institution_admin(old.institution_id)
   and old.source_type='derived' and new.source_type='curated' and old.cancelled_at is null
  ) then raise exception 'Only an institution administrator can claim an active derived event' using errcode='42501'; end if;
  -- AI reprocessing must not overwrite publication decisions or corrections, including parent withdrawal.
  if old.admin_locked and pg_trigger_depth()>1 then return null; end if;
  if direct_admin then
   if not private.is_institution_admin(old.institution_id) then raise exception 'Administrator required' using errcode='42501'; end if;
   new.admin_locked:=true;
   new.evidence:=old.evidence;
   if old.cancelled_at is not null then
    new.cancelled_at:=old.cancelled_at;new.cancellation_reason:=old.cancellation_reason;
    if new.status<>'withdrawn' then raise exception 'Cancelled events cannot be republished; create a new event';end if;
   end if;
  end if;
 end if;
 if direct_admin then
  if not private.is_institution_admin(new.institution_id) then raise exception 'Administrator required' using errcode='42501'; end if;
  if new.source_type='curated' and (length(btrim(new.title))=0 or length(btrim(coalesce(new.description,'')))=0 or (new.schedule_type='timed' and new.starts_at is null)) then raise exception 'Title, description and a start time or date-based schedule are required';end if;
 end if;
 if length(btrim(new.title))=0 or length(new.title)>300 then raise exception 'Title must contain 1–300 characters';end if;
 if new.cancelled_at is not null then
  new.status:='withdrawn';new.rsvp_enabled:=false;
  if tg_op='INSERT' or old.cancelled_at is null then new.cancelled_at:=now();end if;
 end if;
 if new.capacity is not null and new.capacity<(select count(*) from public.event_rsvps r where r.event_id=new.id and r.status='going') then raise exception 'Capacity cannot be below confirmed attendance';end if;
 if new.source_type='curated' then new.verification:=case when new.schedule_type<>'timed' then 'confirmed' when new.starts_at is not null and (new.ends_at is not null or (new.source_email_post_id is not null and new.admin_locked)) then 'confirmed' else 'incomplete' end; end if;
 if new.schedule_type='timed' and (new.starts_at is not null or new.source_type='curated') then new.event_date:=(new.starts_at at time zone new.timezone)::date;end if;
 if new.schedule_type='end_date_only' then new.event_date:=new.event_end_date;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.guard_event() from public,anon,authenticated;


create or replace function public.admin_create_event(p_list uuid,p_fields jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare institution uuid; result uuid;
begin
 select l.institution into institution from public.list l where l.id=p_list;
 if auth.uid() is null or institution is null or not private.is_institution_admin(institution) then raise exception 'Administrator required' using errcode='42501';end if;
 if coalesce(p_fields->>'status','draft') not in ('draft','published') then raise exception 'Invalid initial status';end if;
 insert into public.events(institution_id,list_id,source_type,created_by,title,description,starts_at,ends_at,timezone,location_name,location_address,online_url,registration_url,rsvp_enabled,capacity,status,admin_locked,schedule_type,event_date,event_end_date)
 values(institution,p_list,'curated',auth.uid(),btrim(p_fields->>'title'),btrim(p_fields->>'description'),(p_fields->>'starts_at')::timestamptz,(p_fields->>'ends_at')::timestamptz,p_fields->>'timezone',nullif(p_fields->>'location_name',''),nullif(p_fields->>'location_address',''),nullif(p_fields->>'online_url',''),nullif(p_fields->>'registration_url',''),coalesce((p_fields->>'rsvp_enabled')::boolean,false),(p_fields->>'capacity')::integer,coalesce(p_fields->>'status','draft'),true,coalesce(p_fields->>'schedule_type','timed'),(p_fields->>'event_date')::date,(p_fields->>'event_end_date')::date) returning id into result;
 return result;
end $$;
revoke all on function public.admin_create_event(uuid,jsonb) from public,anon;
grant execute on function public.admin_create_event(uuid,jsonb) to authenticated;


-- Multi-day date-based announcements remain upcoming through their inclusive end date.
create or replace function public.get_events(p_mine boolean default false,p_source_post uuid default null,p_offset integer default 0,p_limit integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; lim integer:=least(greatest(coalesce(p_limit,30),1),100);
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000';end if;
 with items as (
 select e.*,l.tag as list_name,p.original_email_url as source_url,r.status as my_rsvp,
 public.announcement_relevance(coalesce(p.hashtags,e.topics),e.title,e.description) as relevance,
 jsonb_build_object('web_link',c.web_link,'added',c.microsoft_event_id is not null) as calendar_link
 from public.events e join public.list l on l.id=e.list_id and l.institution=e.institution_id
 left join public.email_posts p on p.id=e.source_email_post_id
 left join public.event_rsvps r on r.event_id=e.id and r.user_id=(select auth.uid())
 left join public.event_calendar_links c on c.event_id=e.id and c.user_id=(select auth.uid())
 where private.can_access_event(e.id) and (p_source_post is null or e.source_email_post_id=p_source_post)
 and (not p_mine or r.status in ('going','interested'))
 and (p_source_post is not null or coalesce(e.ends_at,e.starts_at)>=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'
 or (e.starts_at is null and (coalesce(e.event_end_date,e.event_date) is null or coalesce(e.event_end_date,e.event_date)>=(now() at time zone e.timezone)::date)))
 order by e.event_date asc nulls last,e.starts_at asc nulls last,e.id
 limit lim+1 offset greatest(coalesce(p_offset,0),0)
 )
 select jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(x) order by event_date asc nulls last,starts_at asc nulls last,id) from(select * from items limit lim)x),'[]'::jsonb),
 'hasMore',(select count(*)>lim from items)) into result;return result;
end $$;
revoke all on function public.get_events(boolean,uuid,integer,integer) from public,anon;
grant execute on function public.get_events(boolean,uuid,integer,integer) to authenticated;

