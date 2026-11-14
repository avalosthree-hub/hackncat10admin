-- Extends the existing student events model. withdrawn remains the shared hidden/cancelled status.
alter table public.events add column online_url text check (online_url is null or online_url ~ '^https://[^[:space:]]+$');
alter table public.events add column cancelled_at timestamptz;
alter table public.events add column cancellation_reason text;
create index if not exists events_admin_page_idx on public.events(institution_id, starts_at, id);
create index if not exists event_rsvps_status_idx on public.event_rsvps(event_id,status);

create or replace function private.guard_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare direct_admin boolean := current_setting('role',true) = 'authenticated' and pg_trigger_depth()=1;
begin
 if not exists(select 1 from public.list l where l.id=new.list_id and l.institution=new.institution_id) then raise exception 'Event list must belong to its institution'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone'; end if;
 if tg_op='UPDATE' then
  if (new.id,new.institution_id,new.list_id,new.source_type,new.source_email_post_id,new.source_event_key,new.created_by,new.created_at) is distinct from
     (old.id,old.institution_id,old.list_id,old.source_type,old.source_email_post_id,old.source_event_key,old.created_by,old.created_at) then raise exception 'Event identity, source and institution cannot be changed'; end if;
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
  if new.source_type='curated' and (length(btrim(new.title))=0 or length(btrim(new.description))=0 or new.starts_at is null) then raise exception 'Title, description and start time are required';end if;
 end if;
 if length(btrim(new.title))=0 or length(new.title)>300 then raise exception 'Title must contain 1–300 characters';end if;
 if new.cancelled_at is not null then
  new.status:='withdrawn';new.rsvp_enabled:=false;
  if tg_op='INSERT' or old.cancelled_at is null then new.cancelled_at:=now();end if;
 end if;
 if new.capacity is not null and new.capacity<(select count(*) from public.event_rsvps r where r.event_id=new.id and r.status='going') then raise exception 'Capacity cannot be below confirmed attendance';end if;
 if new.source_type='curated' then new.verification:=case when new.starts_at is not null and new.ends_at is not null then 'confirmed' else 'incomplete' end; end if;
 if new.starts_at is not null or new.source_type='curated' then new.event_date:=(new.starts_at at time zone new.timezone)::date;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.guard_event() from public,anon,authenticated;

-- Serialize every attendance change on the event row, then recheck visibility after acquiring the lock.
create or replace function private.guard_rsvp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare item public.events%rowtype;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Own RSVP required' using errcode='42501';end if;
 if tg_op='UPDATE' and (new.event_id,new.user_id) is distinct from (old.event_id,old.user_id) then raise exception 'RSVP identity cannot change';end if;
 select * into item from public.events where id=new.event_id for update;
 if not found or not private.can_access_event(new.event_id) or item.status<>'published' or item.cancelled_at is not null then raise exception 'Event unavailable' using errcode='42501';end if;
 if not item.rsvp_enabled then raise exception 'RSVPs are disabled';end if;
 if new.status='going' and item.capacity is not null and
 (select count(*) from public.event_rsvps where event_id=new.event_id and status='going' and user_id<>new.user_id)>=item.capacity then raise exception 'This event is at capacity';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.guard_rsvp() from public,anon,authenticated;

-- Historical attendance and calendar IDs must survive email deletion as well as admin deletion.
alter table public.events drop constraint events_source_email_post_id_fkey;
alter table public.events add constraint events_source_email_post_id_fkey foreign key(source_email_post_id) references public.email_posts(id) on delete restrict;
create function private.guard_event_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.cancelled_at is not null or exists(select 1 from public.event_rsvps where event_id=old.id) or exists(select 1 from public.event_calendar_links where event_id=old.id) then
  raise exception 'This event has history. Cancel or unpublish it instead of deleting.';
 end if;return old;
end $$;
revoke all on function private.guard_event_delete() from public,anon,authenticated;
create trigger guard_event_delete before delete on public.events for each row execute function private.guard_event_delete();

-- Derive institution on the server from the authorized list. No institution input is accepted.
create function public.admin_create_event(p_list uuid,p_fields jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare institution uuid; result uuid;
begin
 select l.institution into institution from public.list l where l.id=p_list;
 if auth.uid() is null or institution is null or not private.is_institution_admin(institution) then raise exception 'Administrator required' using errcode='42501';end if;
 if coalesce(p_fields->>'status','draft') not in ('draft','published') then raise exception 'Invalid initial status';end if;
 insert into public.events(institution_id,list_id,source_type,created_by,title,description,starts_at,ends_at,timezone,location_name,location_address,online_url,registration_url,rsvp_enabled,capacity,status,admin_locked)
 values(institution,p_list,'curated',auth.uid(),btrim(p_fields->>'title'),btrim(p_fields->>'description'),(p_fields->>'starts_at')::timestamptz,(p_fields->>'ends_at')::timestamptz,p_fields->>'timezone',nullif(p_fields->>'location_name',''),nullif(p_fields->>'location_address',''),nullif(p_fields->>'online_url',''),nullif(p_fields->>'registration_url',''),coalesce((p_fields->>'rsvp_enabled')::boolean,false),(p_fields->>'capacity')::integer,coalesce(p_fields->>'status','draft'),true) returning id into result;
 return result;
end $$;
revoke all on function public.admin_create_event(uuid,jsonb) from public,anon;
grant execute on function public.admin_create_event(uuid,jsonb) to authenticated;

-- Conversion is independent of browser timezone; reject DST gaps and folds rather than guessing.
create function public.admin_event_timestamp(p_local text,p_timezone text) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare local_time timestamp; result timestamptz; shift integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid IANA timezone';end if;
 if p_local is null or p_local='' then return null;end if;
 if p_local !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then raise exception 'Enter a valid local date and time';end if;
 local_time:=p_local::timestamp;result:=local_time at time zone p_timezone;
 if result at time zone p_timezone<>local_time then raise exception 'This time does not exist due to daylight saving time';end if;
 foreach shift in array array[-120,-60,-30,30,60,120] loop
  if (result+make_interval(mins=>shift)) at time zone p_timezone=local_time then raise exception 'This time is ambiguous due to daylight saving time';end if;
 end loop;
 return result;
end $$;
revoke all on function public.admin_event_timestamp(text,text) from public,anon;
grant execute on function public.admin_event_timestamp(text,text) to authenticated;

-- Aggregate counts avoid exposing a student directory or broadening RSVP writes.
create function public.admin_event_metrics(p_institution uuid,p_events uuid[]) returns table(event_id uuid,going bigint,interested bigint,not_going bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_institution_admin(p_institution) then raise exception 'Administrator required' using errcode='42501';end if;
 return query select e.id,count(r.user_id) filter(where r.status='going'),count(r.user_id) filter(where r.status='interested'),count(r.user_id) filter(where r.status='not_going')
 from public.events e left join public.event_rsvps r on r.event_id=e.id where e.institution_id=p_institution and e.id=any(p_events) group by e.id;
end $$;
create function public.admin_event_attendees(p_event uuid,p_offset integer default 0,p_status text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare institution uuid; result jsonb;
begin
 select institution_id into institution from public.events where id=p_event;
 if auth.uid() is null or institution is null or not private.is_institution_admin(institution) then raise exception 'Event unavailable' using errcode='42501';end if;
 with rows as(select au.email::text as email,r.status,r.updated_at from public.event_rsvps r join auth.users au on au.id=r.user_id where r.event_id=p_event and (p_status is null or r.status=p_status) order by r.updated_at desc,r.user_id limit 51 offset greatest(0,p_offset))
 select jsonb_build_object('attendees',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from rows limit 50)x),'[]'::jsonb),'hasMore',(select count(*)>50 from rows)) into result;
 return result;
end $$;
create function public.admin_event_original(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; institution uuid;
begin
 select institution_id into institution from public.events where id=p_event;
 if auth.uid() is null or institution is null or not private.is_institution_admin(institution) then raise exception 'Event unavailable' using errcode='42501';end if;
 select jsonb_build_object('id',p.id,'title',p.title,'sender',p.sender,'subject',p.subject,'raw_email',p.raw_email,'event_times',p.event_times,'locations',p.locations) into result
 from public.events e join public.email_posts p on p.id=e.source_email_post_id and p.institution_id=e.institution_id and p.list_id=e.list_id where e.id=p_event;
 return result;
end $$;
revoke all on function public.admin_event_metrics(uuid,uuid[]) from public,anon;
revoke all on function public.admin_event_attendees(uuid,integer,text) from public,anon;
revoke all on function public.admin_event_original(uuid) from public,anon;
grant execute on function public.admin_event_metrics(uuid,uuid[]) to authenticated;
grant execute on function public.admin_event_attendees(uuid,integer,text) to authenticated;
grant execute on function public.admin_event_original(uuid) to authenticated;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
-- Existing institution admin and subscription policies are reused; no RSVP write permissions are added.
-- Preserve the established synchronizer; repair over-escaped SQL regexes and match unchanged source evidence across AI label edits.
CREATE OR REPLACE FUNCTION private.safe_event_time(date_value text, time_value text, zone text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare local_value timestamp; resolved timestamptz;
begin
 if date_value !~ '^\d{4}-\d{2}-\d{2}$' or time_value !~ '^([01]\d|2[0-3]):[0-5]\d$' then return null; end if;
 local_value:=(date_value||' '||time_value)::timestamp;resolved:=local_value at time zone zone;
 if resolved at time zone zone<>local_value or (resolved-interval '1 hour') at time zone zone=local_value or (resolved+interval '1 hour') at time zone zone=local_value then return null; end if;
 return resolved;
exception when others then return null;
end $function$
;
CREATE OR REPLACE FUNCTION private.sync_email_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare entry jsonb; key text; keys text[]:='{}'; occurrence integer; counts jsonb:='{}'; label text;
 starts timestamptz; ends timestamptz; zone text; source text; evidence text; trusted boolean; eventday date; loc text;
begin
 if new.status<>'published' or new.list_id is null or new.institution_id is null then
  update public.events set status='withdrawn' where source_email_post_id=new.id and source_type='derived';return new;
 end if;
 source:=coalesce(new.raw_email->'data'->>'text',new.raw_email->>'text',regexp_replace(coalesce(new.raw_email->>'html',''),'<[^>]*>',' ','g'));
 if new.source='manual' then source:=new.content;end if;
 for entry in select value from jsonb_array_elements(case when jsonb_typeof(new.event_times)='array' then new.event_times else '[]'::jsonb end) loop
  if entry->>'type'='deadline' then continue; end if;
  label:=coalesce(nullif(entry->>'label',''),nullif(entry->>'title',''),new.title,'Campus event');
  key:=lower(trim(label));occurrence:=coalesce((counts->>key)::integer,0)+1;counts:=jsonb_set(counts,array[key],to_jsonb(occurrence),true);
  key:=coalesce(nullif(entry->>'source_event_id',''),
   (select e.source_event_key from public.events e where e.source_email_post_id=new.id
    and coalesce(entry->'extraction'->>'text','')<>''
    and e.evidence->'extraction'->>'text'=entry->'extraction'->>'text'
    and not(e.source_event_key=any(keys)) order by e.created_at,e.id limit 1),
   md5(key)||':'||occurrence::text);keys:=array_append(keys,key);
  evidence:=coalesce(entry->'extraction'->>'text',case when jsonb_typeof(entry)='string' then entry#>>'{}' end,'');
  trusted:=new.source='manual' or (length(evidence)>0 and position(lower(regexp_replace(evidence,'\s+',' ','g')) in lower(regexp_replace(source,'\s+',' ','g')))>0);
  zone:=coalesce(entry->'normalized'->>'timezone','America/New_York');
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone:='America/New_York';end if;
  starts:=null;ends:=null;eventday:=null;
  if trusted then
   begin
    if entry->'normalized'->>'start' ~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then starts:=(entry->'normalized'->>'start')::timestamptz;end if;
    if entry->'normalized'->>'end' ~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then ends:=(entry->'normalized'->>'end')::timestamptz;end if;
    if entry->'extraction'->>'date' ~ '^\d{4}-\d{2}-\d{2}$' then eventday:=(entry->'extraction'->>'date')::date;end if;
    starts:=coalesce(starts,private.safe_event_time(entry->'extraction'->>'date',entry->'extraction'->>'startTime',zone));
    ends:=coalesce(ends,private.safe_event_time(coalesce(entry->'extraction'->>'endDate',entry->'extraction'->>'date'),entry->'extraction'->>'endTime',zone));
    if new.source='manual' and jsonb_typeof(entry)='string' then starts:=(entry#>>'{}')::timestamptz;end if;
   exception when invalid_datetime_format or datetime_field_overflow then starts:=null;ends:=null;eventday:=null;
   end;
  end if;
  if ends<=starts then ends:=null;end if;
  loc:=null;
  if jsonb_array_length(coalesce(new.event_times,'[]'))=1 and jsonb_typeof(new.locations)='array' then
   select coalesce(value->'normalized'->>'name',value#>>'{}') into loc from jsonb_array_elements(new.locations) limit 1;
  end if;
  insert into public.events(institution_id,list_id,source_type,source_email_post_id,source_event_key,title,description,starts_at,ends_at,timezone,event_date,evidence,verification,location_name,status)
  values(new.institution_id,new.list_id,'derived',new.id,key,label,coalesce(new.content,''),starts,ends,zone,coalesce(eventday,(starts at time zone zone)::date),entry,
  case when not trusted then 'unverified' when starts is not null and ends is not null then 'confirmed' else 'incomplete' end,loc,'published')
  on conflict(source_email_post_id,source_event_key) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  timezone=excluded.timezone,event_date=excluded.event_date,evidence=excluded.evidence,verification=excluded.verification,location_name=excluded.location_name,status='published'
  where not public.events.admin_locked;
 end loop;
 update public.events set status='withdrawn' where source_email_post_id=new.id and source_type='derived' and not(source_event_key=any(keys)) and not admin_locked;
 return new;
end $function$
;
