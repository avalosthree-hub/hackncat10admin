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


create temp table attachment_snapshot as select id,hashtags from public.email_posts where id=(select post_id from event_test);
update public.email_posts p set attachments=jsonb_build_array(jsonb_build_object('id','file','name','flyer.pdf','status','stored','storage_path',p.institution_id::text||'/'||p.id::text||'/file')) where p.id=(select post_id from event_test);
insert into storage.objects(bucket_id,name) select 'email-attachments',institution::text||'/'||post_id::text||'/file' from event_test;
select set_config('request.jwt.claim.sub',admin_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event(public.admin_set_institution_topics(institution,array[' Research Opportunities ','research opportunities','Events'],array[]::text[])=array['Research Opportunities','Events'],'institution topics normalized') from event_test;
select pg_temp.check_event((select count(*)=1 from storage.objects where bucket_id='email-attachments' and name=(select institution::text||'/'||post_id::text||'/file' from event_test)),'admin reads institution attachment');
do $$begin
 begin perform public.admin_set_institution_topics((select outside_institution from event_test),array['Forbidden']);raise exception 'FAILED: cross institution topics';exception when insufficient_privilege then null;end;
 begin perform public.admin_set_institution_topics((select institution from event_test),array['Changed'],array[]::text[]);raise exception 'FAILED: stale topics';exception when raise_exception then if sqlerrm like 'FAILED:%' then raise;end if;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event((select count(*)=1 from storage.objects where bucket_id='email-attachments' and name=(select institution::text||'/'||post_id::text||'/file' from event_test)),'subscribed student reads attachment');
select pg_temp.check_event(public.get_feed_personalization()->'topics' ? 'research opportunities','student preferences use institution topics');
select pg_temp.check_event(public.get_feed_personalization()->'lists'->0->'hashtags' ? 'Events','list preference metadata uses institution topics');
do $$begin
 begin perform public.admin_set_institution_topics((select institution from event_test),array['Forbidden']);raise exception 'FAILED: student topics';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('email-attachments','forbidden');raise exception 'FAILED: student upload';exception when insufficient_privilege then null;end;
end$$;
reset role;
delete from public.list_subscriptions where user_id=(select u.id from public.users u join event_test t on u.auth_id=t.second_student);
select set_config('request.jwt.claim.sub',second_student::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event((select count(*)=0 from storage.objects where bucket_id='email-attachments'),'unsubscribed student cannot read attachments');
reset role;
update public.email_posts set status='draft' where id=(select post_id from event_test);
select set_config('request.jwt.claim.sub',student_id::text,true) from event_test;
set local role authenticated;
select pg_temp.check_event((select count(*)=0 from storage.objects where bucket_id='email-attachments'),'draft attachments hidden from students');
reset role;
set local role anon;
select pg_temp.check_event((select count(*)=0 from storage.objects where bucket_id='email-attachments'),'anonymous attachments inaccessible');
reset role;
select pg_temp.check_event((select p.hashtags is not distinct from s.hashtags from public.email_posts p join attachment_snapshot s using(id)),'existing email hashtags unchanged');
rollback;
