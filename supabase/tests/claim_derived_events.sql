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

-- Explicit fixture time keeps claim tests independent of extraction normalization.
update public.events set starts_at='2027-01-20T18:00:00Z',ends_at='2027-01-20T19:00:00Z' where source_email_post_id=(select post_id from event_test);
create temp table claimed_snapshot as select * from public.events where source_email_post_id=(select post_id from event_test);
grant select on claimed_snapshot to authenticated;
-- A subscribed student can RSVP but cannot claim an event.
update public.events set rsvp_enabled=true where id=(select id from claimed_snapshot);
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
insert into public.event_rsvps(event_id,user_id,status) select s.id,t.student_id,'going' from claimed_snapshot s cross join event_test t;
with changed as (update public.events set source_type='curated' where id=(select id from claimed_snapshot) returning id)
select pg_temp.check_event((select count(*)=0 from changed),'student cannot claim');
reset role;
-- An admin in a different institution cannot claim it either.
insert into public.institution_admins(user_id,institution_id,role) select u.id,t.outside_institution,'admin' from event_test t join public.users u on u.auth_id=t.second_student;
select set_config('request.jwt.claim.sub',second_student::text,true) from event_test;
set local role authenticated;
with changed as (update public.events set source_type='curated' where id=(select id from claimed_snapshot) returning id)
select pg_temp.check_event((select count(*)=0 from changed),'outside admin cannot claim');
reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
do $$begin
 begin update public.events set source_type='curated',starts_at=null where id=(select id from claimed_snapshot);raise exception 'FAILED: missing start';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
 begin update public.events set source_type='curated',description=null where id=(select id from claimed_snapshot);raise exception 'FAILED: missing description';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
end$$;
update public.events set source_type='curated',title='Verified showcase',description='Verified description',ends_at=null where id=(select id from claimed_snapshot) and source_type='derived';
select pg_temp.check_event((select e.source_type='curated' and e.admin_locked and e.verification='confirmed' and e.title='Verified showcase' and e.source_email_post_id=s.source_email_post_id and e.source_event_key=s.source_event_key and e.evidence=s.evidence from public.events e join claimed_snapshot s using(id)),'claim preserves source and confirms reviewed details');
select pg_temp.check_event((select going=1 from public.admin_event_metrics((select institution from event_test),array[(select id from claimed_snapshot)])),'claim retains RSVPs');
with changed as (update public.events set title='Stale overwrite' where id=(select id from claimed_snapshot) and updated_at=(select updated_at from claimed_snapshot) returning id)
select pg_temp.check_event((select count(*)=0 from changed),'stale writes rejected');
do $$begin
 begin update public.events set source_type='derived' where id=(select id from claimed_snapshot);raise exception 'FAILED: reverse claim';exception when insufficient_privilege then null;end;
 begin update public.events set source_event_key='replacement' where id=(select id from claimed_snapshot);raise exception 'FAILED: changed source key';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
end$$;
reset role;
-- Reprocessing and source withdrawal preserve claimed details and identity.
update public.email_posts set title='Reprocessed source' where id=(select post_id from event_test);
select pg_temp.check_event((select count(*)=1 from public.events where source_email_post_id=(select post_id from event_test)),'reprocessing does not duplicate claimed event');
update public.email_posts set status='draft' where id=(select post_id from event_test);
select pg_temp.check_event((select title='Verified showcase' and status='published' and source_type='curated' from public.events where id=(select id from claimed_snapshot)),'source withdrawal preserves curated event');
rollback;
