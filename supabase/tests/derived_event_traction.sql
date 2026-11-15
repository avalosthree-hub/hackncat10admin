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

delete from public.events where source_email_post_id=(select post_id from event_test);

insert into public.events(institution_id,list_id,source_type,source_email_post_id,source_event_key,title,description,starts_at,timezone,status,rsvp_enabled)
select t.institution,t.list_id,'derived',t.post_id,'queue-'||n,'Queue event '||lpad(n::text,2,'0'),'Description','2027-01-01T18:00:00Z'::timestamptz+n*interval '1 day','America/New_York','published',true from event_test t cross join generate_series(1,14) n;
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
insert into public.event_rsvps(event_id,user_id,status) select e.id,t.student_id,case when e.source_event_key='queue-1' then 'not_going' when e.source_event_key='queue-13' then 'interested' else 'going' end from public.events e cross join event_test t where e.source_email_post_id=t.post_id and e.source_event_key in('queue-1','queue-13','queue-14');
do $$begin
 begin perform public.admin_derived_event_queue((select institution from event_test));raise exception 'FAILED: student queue';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',second_student::text,true) from event_test;
set local role authenticated;
insert into public.event_rsvps(event_id,user_id,status) select e.id,t.second_student,'interested' from public.events e cross join event_test t where e.source_email_post_id=t.post_id and e.source_event_key='queue-14';
reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event((public.admin_derived_event_queue(institution)->'events'->0->>'source_event_key')='queue-14','popular event ranks before date and pagination') from event_test;
select pg_temp.check_event((public.admin_derived_event_queue(institution)->'events'->1->>'source_event_key')='queue-13','interested students count as traction') from event_test;
select pg_temp.check_event((public.admin_derived_event_queue(institution)->'metrics'->0->>'going')::integer=1 and (public.admin_derived_event_queue(institution)->'metrics'->0->>'interested')::integer=1,'counts returned without student identities') from event_test;
select pg_temp.check_event(jsonb_array_length(public.admin_derived_event_queue(institution)->'events')=12 and (public.admin_derived_event_queue(institution)->>'total')::integer=14,'first page and exact total') from event_test;
select pg_temp.check_event(jsonb_array_length(public.admin_derived_event_queue(institution,p_page=>1)->'events')=2,'second page contains remaining events') from event_test;
select pg_temp.check_event((public.admin_derived_event_queue(institution,p_search=>'Queue event 01')->'metrics'->0->>'not_going')::integer=1,'not going does not increase traction') from event_test;
select pg_temp.check_event((public.admin_derived_event_queue(institution,p_search=>'%')->>'total')::integer=0,'search treats wildcard literally') from event_test;
select pg_temp.check_event((public.admin_derived_event_queue(institution,p_list=>outside_list)->>'total')::integer=0,'list filter remains tenant scoped') from event_test;
do $$begin
 begin perform public.admin_derived_event_queue((select outside_institution from event_test));raise exception 'FAILED: outside queue';exception when insufficient_privilege then null;end;
 begin perform public.admin_derived_event_queue((select institution from event_test),p_page=>-1);raise exception 'FAILED: negative page';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform public.admin_derived_event_queue((select institution from event_test));raise exception 'FAILED: anonymous queue';exception when insufficient_privilege then null;end;
end$$;
rollback;
