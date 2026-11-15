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
insert into public.email_posts(id,email_id,title,content,status,list_id,institution_id,source,event_times) select post_id,post_id::text,'Source email','Original content','published',list_id,institution,'manual',jsonb_build_array(jsonb_build_object('type','event','source_event_id','stable-event','title','Derived showcase','normalized',jsonb_build_object('start','2027-01-20T18:00:00Z','end','2027-01-20T19:00:00Z'))) from event_test;


select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
select public.admin_create_event(list_id,jsonb_build_object('title','All day range','description','All day description','timezone','America/New_York','schedule_type','all_day','event_date',((now() at time zone 'America/New_York')::date-1)::text,'event_end_date',((now() at time zone 'America/New_York')::date+1)::text,'status','published')) from event_test;
select public.admin_create_event(list_id,'{"title":"Date only","description":"No time stated","timezone":"America/New_York","schedule_type":"date_only","event_date":"2027-01-20","status":"published"}') from event_test;
select public.admin_create_event(list_id,'{"title":"End date only","description":"Only the last day is known","timezone":"America/New_York","schedule_type":"end_date_only","event_end_date":"2027-01-22","status":"published"}') from event_test;
select pg_temp.check_event((select count(*)=3 from public.events where institution_id=(select institution from event_test) and source_type='curated' and starts_at is null and ends_at is null and verification='confirmed'),'date events created without fabricated times');
select pg_temp.check_event((select event_date='2027-01-22'::date and event_end_date='2027-01-22'::date from public.events where title='End date only'),'end-only anchor retained for existing consumers');
update public.events set source_type='curated',schedule_type='date_only',event_date='2027-01-21',starts_at=null,ends_at=null where source_email_post_id=(select post_id from event_test);
select pg_temp.check_event((select source_type='curated' and admin_locked and event_date='2027-01-21'::date and starts_at is null from public.events where source_email_post_id=(select post_id from event_test)),'claim accepts known date without time');
do $$begin
 begin perform public.admin_create_event((select list_id from event_test),'{"title":"Missing date","description":"Description","timezone":"America/New_York","schedule_type":"all_day"}');raise exception 'FAILED: missing date';exception when check_violation then null;end;
 begin perform public.admin_create_event((select list_id from event_test),'{"title":"Reversed range","description":"Description","timezone":"America/New_York","schedule_type":"all_day","event_date":"2027-01-22","event_end_date":"2027-01-20"}');raise exception 'FAILED: reversed range';exception when check_violation then null;end;
 begin perform public.admin_create_event((select list_id from event_test),'{"title":"Missing time","description":"Description","timezone":"America/New_York"}');raise exception 'FAILED: missing timed start';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
 begin perform public.admin_create_event((select list_id from event_test),'{"title":"Invented time","description":"Description","timezone":"America/New_York","schedule_type":"date_only","event_date":"2027-01-20","starts_at":"2027-01-20T00:00:00Z"}');raise exception 'FAILED: timestamp on date-only';exception when check_violation then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event(exists(select 1 from jsonb_array_elements(public.get_events()->'events') e where e->>'title'='All day range' and e->>'schedule_type'='all_day'),'student upcoming feed retains ongoing date range');
do $$begin
 begin perform public.admin_create_event((select list_id from event_test),'{"title":"Forbidden","schedule_type":"all_day","event_date":"2027-01-20"}');raise exception 'FAILED: student creation';exception when insufficient_privilege then null;end;
end$$;
rollback;
