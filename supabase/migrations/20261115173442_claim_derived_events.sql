-- Claimed events retain their source identity so extraction cannot create duplicates.
alter table public.events drop constraint events_check1;
alter table public.events add constraint events_check1 check (
 (source_type='derived' and source_email_post_id is not null and source_event_key is not null)
 or (source_type='curated' and (
  (source_email_post_id is null and source_event_key is null)
  or (source_email_post_id is not null and source_event_key is not null and admin_locked)
 ))
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
  if new.source_type='curated' and (length(btrim(new.title))=0 or length(btrim(coalesce(new.description,'')))=0 or new.starts_at is null) then raise exception 'Title, description and start time are required';end if;
 end if;
 if length(btrim(new.title))=0 or length(new.title)>300 then raise exception 'Title must contain 1–300 characters';end if;
 if new.cancelled_at is not null then
  new.status:='withdrawn';new.rsvp_enabled:=false;
  if tg_op='INSERT' or old.cancelled_at is null then new.cancelled_at:=now();end if;
 end if;
 if new.capacity is not null and new.capacity<(select count(*) from public.event_rsvps r where r.event_id=new.id and r.status='going') then raise exception 'Capacity cannot be below confirmed attendance';end if;
 if new.source_type='curated' then new.verification:=case when new.starts_at is not null and (new.ends_at is not null or (new.source_email_post_id is not null and new.admin_locked)) then 'confirmed' else 'incomplete' end; end if;
 if new.starts_at is not null or new.source_type='curated' then new.event_date:=(new.starts_at at time zone new.timezone)::date;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.guard_event() from public,anon,authenticated;

