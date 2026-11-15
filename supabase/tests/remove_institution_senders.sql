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


insert into public.list(id,tag,institution) select draft_id,'Second internal list',institution from event_test;
insert into public.list_senders(list_id,sender_email) select list_id,'shared@university.edu' from event_test union all select draft_id,'shared@university.edu' from event_test union all select outside_list,'shared@university.edu' from event_test;
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
do $$begin
 begin perform public.admin_remove_institution_sender((select institution from event_test),(select id from public.institution_senders limit 1));raise exception 'FAILED: student removal';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
select public.admin_remove_institution_sender(institution,(select id from public.institution_senders where institution_id=t.institution and sender_email='shared@university.edu')) from event_test t;
select pg_temp.check_event((select count(*)=0 from public.institution_senders where sender_email='shared@university.edu'),'directory address removed');
select pg_temp.check_event((select count(*)=0 from public.list_senders where sender_email='shared@university.edu'),'all institution approvals removed');
reset role;
select pg_temp.check_event((select count(*)=1 from public.list_senders where sender_email='shared@university.edu'),'other institution approvals preserved');
select pg_temp.check_event((select count(*)=1 from public.email_posts where id=(select post_id from event_test)),'historical email preserved');
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
-- Re-adding after removal rebuilds a valid directory reference.
insert into public.list_senders(list_id,sender_email) select list_id,'shared@university.edu' from event_test;
select pg_temp.check_event((select directory_sender_id is not null from public.list_senders where list_id=(select list_id from event_test)),'reapproval creates directory link');
rollback;
