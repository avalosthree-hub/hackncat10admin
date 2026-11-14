-- Run against the shared Aggie Fetch schema as postgres. All fixtures roll back.
begin;
create temp table event_test as select gen_random_uuid() institution,gen_random_uuid() outside_institution,
 gen_random_uuid() admin_id,gen_random_uuid() student_id,gen_random_uuid() second_student,
 gen_random_uuid() list_id,gen_random_uuid() outside_list,gen_random_uuid() event_id,gen_random_uuid() draft_id,gen_random_uuid() post_id;
grant select on event_test to authenticated,anon;
create function pg_temp.check_event(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end$$;
insert into public.institutions(id,name) select institution,'Event test' from event_test union all select outside_institution,'Outside event test' from event_test;
insert into auth.users(id,email) select admin_id,admin_id::text||'@events-test.edu' from event_test union all select student_id,student_id::text||'@events-test.edu' from event_test union all select second_student,second_student::text||'@events-test.edu' from event_test;
update public.users u set institution_id=c.institution from event_test c where u.auth_id in(c.admin_id,c.student_id,c.second_student);
insert into public.institution_admins(user_id,institution_id,role) select u.id,c.institution,'admin' from event_test c join public.users u on u.auth_id=c.admin_id;
insert into public.list(id,tag,institution) select list_id,'Event list',institution from event_test union all select outside_list,'Outside list',outside_institution from event_test;
insert into public.list_subscriptions(user_id,list_id) select u.id,c.list_id from event_test c join public.users u on u.auth_id in(c.student_id,c.second_student);
insert into public.email_posts(id,email_id,title,content,status,list_id,institution_id,source,event_times) select post_id,post_id::text,'Source email','Original content','published',list_id,institution,'manual',jsonb_build_array(jsonb_build_object('source_event_id','stable-event','title','Derived showcase','normalized',jsonb_build_object('start','2027-01-20T18:00:00Z','end','2027-01-20T19:00:00Z'))) from event_test;
select pg_temp.check_event((select starts_at='2027-01-20T18:00:00Z'::timestamptz from public.events where source_email_post_id=(select post_id from event_test)),'normalized derived timestamp parsing');
-- Outside events remain invisible to this institution's administrator.
insert into public.events(id,institution_id,list_id,source_type,title,description,starts_at,timezone,status)
select outside_list,outside_institution,outside_list,'curated','Outside event','Outside description','2027-01-20T18:00:00Z','America/New_York','published' from event_test;
set local role anon;
do $$begin begin perform pg_temp.check_event((select count(*)=0 from public.events),'anonymous events inaccessible');exception when insufficient_privilege then null;end;end$$;
reset role;
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
do $$begin
 begin perform public.admin_create_event((select list_id from event_test),'{"title":"Forbidden"}');raise exception 'FAILED: student creation';exception when insufficient_privilege then null;end;
 begin perform public.admin_event_metrics((select institution from event_test),'{}');raise exception 'FAILED: student metrics';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event((select count(*)=0 from public.events where id=(select outside_list from event_test)),'cross institution event read blocked');
with changed as(update public.events set title='Forbidden' where id=(select outside_list from event_test) returning id)
select pg_temp.check_event((select count(*)=0 from changed),'cross institution event update blocked');
with removed as(delete from public.events where id=(select outside_list from event_test) returning id)
select pg_temp.check_event((select count(*)=0 from removed),'cross institution event delete blocked');
-- Admin RPC derives institution; arbitrary client institution fields are ignored.
select public.admin_create_event(list_id,jsonb_build_object('title','Curated via RPC','description','Description','starts_at','2027-01-20T12:00:00Z','timezone','America/New_York','status','draft','institution_id',outside_institution)) from event_test;
insert into public.events(id,institution_id,list_id,source_type,created_by,title,description,starts_at,timezone,status,capacity)
select event_id,institution,list_id,'curated',admin_id,'Capacity event','Description','2027-01-20T18:00:00Z','America/New_York','published',1 from event_test;
insert into public.events(id,institution_id,list_id,source_type,created_by,title,description,starts_at,timezone,status)
select draft_id,institution,list_id,'curated',admin_id,'Draft event','Description','2027-01-20T18:00:00Z','America/New_York','draft' from event_test;
select pg_temp.check_event((select count(*)=1 from public.events where title='Curated via RPC' and institution_id=(select institution from event_test)),'admin creates curated, derives tenant');
do $$begin
 begin perform public.admin_create_event((select outside_list from event_test),'{"title":"Forbidden"}');raise exception 'FAILED: outside creation';exception when insufficient_privilege then null;end;
 begin perform public.admin_event_metrics((select outside_institution from event_test),'{}');raise exception 'FAILED: outside metrics';exception when insufficient_privilege then null;end;
 begin update public.events set institution_id=(select outside_institution from event_test) where id=(select event_id from event_test);raise exception 'FAILED: tenant reassignment';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
end$$;
select pg_temp.check_event(public.admin_event_timestamp('2027-01-20T13:00','America/New_York')='2027-01-20T18:00:00Z'::timestamptz,'timezone conversion');
do $$begin
 begin perform public.admin_event_timestamp('2027-03-14T02:30','America/New_York');raise exception 'FAILED: DST gap';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
 begin perform public.admin_event_timestamp('2027-11-07T01:30','America/New_York');raise exception 'FAILED: DST fold';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event((select count(*)=1 from public.events where id=(select event_id from event_test)),'subscribed curated visibility');
select pg_temp.check_event((select count(*)=0 from public.events where id=(select draft_id from event_test)),'draft hidden');
select pg_temp.check_event(not exists(select 1 from jsonb_array_elements(public.get_events()->'events') e where e->>'id'=(select draft_id::text from event_test)),'draft excluded by student RPC');
insert into public.event_rsvps(event_id,user_id,status) select event_id,student_id,'going' from event_test;
with changed as(update public.events set title='Forbidden' where id=(select event_id from event_test) returning id) select pg_temp.check_event((select count(*)=0 from changed),'student cannot edit event');
do $$begin
 begin insert into public.event_rsvps(event_id,user_id,status) select event_id,second_student,'interested' from event_test;raise exception 'FAILED: RSVP impersonation';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',second_student::text,true) from event_test;
set local role authenticated;
do $$begin
 begin insert into public.event_rsvps(event_id,user_id,status) select event_id,second_student,'going' from event_test;raise exception 'FAILED: capacity';exception when raise_exception then if sqlerrm<>'This event is at capacity' then raise;end if;end;
end$$;
insert into public.event_rsvps(event_id,user_id,status) select event_id,second_student,'interested' from event_test;
reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
update public.events set title='Edited event',location_name='New location',starts_at='2027-01-20T19:00:00Z' where id=(select event_id from event_test);
select pg_temp.check_event((select going=1 and interested=1 from public.admin_event_metrics((select institution from event_test),array[(select event_id from event_test)])),'metrics and RSVP preservation');
select pg_temp.check_event(jsonb_array_length(public.admin_event_attendees((select event_id from event_test))->'attendees')=2,'authorized minimal attendee view');
update public.events set title='Admin correction' where source_email_post_id=(select post_id from event_test);
select pg_temp.check_event((public.admin_event_original((select id from public.events where source_email_post_id=(select post_id from event_test)))->>'title')='Source email','authorized original email');
do $$begin
 begin insert into public.event_rsvps(event_id,user_id,status) select event_id,student_id,'not_going' from event_test;raise exception 'FAILED: admin impersonation';exception when insufficient_privilege then null;end;
 begin delete from public.events where id=(select event_id from event_test);raise exception 'FAILED: delete history';exception when raise_exception then if sqlerrm not like 'This event has history%' then raise;end if;end;
end$$;
update public.events set status='withdrawn',cancelled_at=now(),cancellation_reason='Weather' where id=(select event_id from event_test);
reset role;
-- Deadlines stay outside the attendable event table. AI label changes with unchanged
-- evidence resolve to the previous source key, preserving existing student references.
update public.email_posts set event_times=event_times || jsonb_build_array(
 jsonb_build_object('type','deadline','label','Submit abstract','extraction',jsonb_build_object('text','Submission deadline')),
 jsonb_build_object('type','event','label','Original AI label','extraction',jsonb_build_object('text','Stable evidence excerpt'))) where id=(select post_id from event_test);
select pg_temp.check_event((select count(*)=2 from public.events where source_email_post_id=(select post_id from event_test)),'deadlines excluded');
create temp table evidence_before as select id from public.events where title='Original AI label' and source_email_post_id=(select post_id from event_test);
update public.email_posts set event_times=jsonb_set(event_times,'{2,label}','"New AI label"') where id=(select post_id from event_test);
select pg_temp.check_event((select id=(select id from evidence_before) from public.events where title='New AI label' and source_email_post_id=(select post_id from event_test)),'source evidence preserves identity on label edits');
-- Reprocessing preserves the derived ID, email reference, overrides and RSVPs.
create temp table derived_before as select id from public.events where source_event_key='stable-event' and source_email_post_id=(select post_id from event_test);
update public.email_posts set content='New AI content' where id=(select post_id from event_test);
select pg_temp.check_event((select count(*)=1 and bool_and(title='Admin correction') and bool_and(id=(select id from derived_before)) from public.events where source_event_key='stable-event' and source_email_post_id=(select post_id from event_test)),'idempotent extraction and protected correction');
update public.email_posts set status='draft' where id=(select post_id from event_test);
select pg_temp.check_event((select title='Admin correction' and admin_locked from public.events where id=(select id from derived_before)),'source withdrawal preserves correction');
select pg_temp.check_event((select content='New AI content' from public.email_posts where id=(select post_id from event_test)),'event edit did not alter email');
select pg_temp.check_event((select count(*)=2 from public.event_rsvps where event_id=(select event_id from event_test)),'cancellation retains history');
select set_config('request.jwt.claim.sub',second_student::text,true) from event_test;
set local role authenticated;
-- With the cancelled event hidden, RLS excludes this row from updates.
update public.event_rsvps set status='going' where event_id=(select event_id from event_test);
reset role;
select pg_temp.check_event((select status='interested' from public.event_rsvps where event_id=(select event_id from event_test) and user_id=(select second_student from event_test)),'cancelled event blocks new Going');
select pg_temp.check_event(not has_table_privilege('authenticated','public.outlook_connections','SELECT'),'Outlook credentials remain private');
rollback;
select 'PASS: event role restrictions, institution isolation, publication visibility, derived references and overrides, stable IDs and RSVPs, capacity, cancellation, timezones, attendee privacy and OAuth privacy. Fixtures rolled back.' as result;
