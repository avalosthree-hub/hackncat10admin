-- Run as postgres in the Aggie Fetch database. All fixtures and mutations roll back.
begin;
create temp table admin_test_context as select
  gen_random_uuid() as institution, gen_random_uuid() as other_institution,
  gen_random_uuid() as owner_auth, gen_random_uuid() as admin_auth,
  gen_random_uuid() as student_auth, gen_random_uuid() as outsider_auth,
  gen_random_uuid() as first_list, gen_random_uuid() as second_list,
  gen_random_uuid() as outside_list, gen_random_uuid() as sender, gen_random_uuid() as post;
grant select on admin_test_context to authenticated, anon;
create function pg_temp.check_test(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %', label; end if; end $$;
insert into public.institutions(id,name)
select institution,'Dashboard test institution' from admin_test_context
union all select other_institution,'Outside test institution' from admin_test_context;
insert into auth.users(id,email)
select owner_auth,owner_auth::text || '@dashboard-test.edu' from admin_test_context
union all select admin_auth,admin_auth::text || '@dashboard-test.edu' from admin_test_context
union all select student_auth,student_auth::text || '@dashboard-test.edu' from admin_test_context
union all select outsider_auth,outsider_auth::text || '@dashboard-test.edu' from admin_test_context;
update public.users u set institution_id = case when u.auth_id = c.outsider_auth then c.other_institution else c.institution end
from admin_test_context c where u.auth_id in(c.owner_auth,c.admin_auth,c.student_auth,c.outsider_auth);
insert into public.institution_admins(user_id,institution_id,role)
select u.id,c.institution,case when u.auth_id=c.owner_auth then 'owner' else 'admin' end
from admin_test_context c join public.users u on u.auth_id in(c.owner_auth,c.admin_auth);
insert into public.list(id,tag,institution,hashtags)
select first_list,'First list',institution,array['Original topic'] from admin_test_context
union all select second_list,'Second list',institution,array[]::text[] from admin_test_context
union all select outside_list,'Outside list',other_institution,array[]::text[] from admin_test_context;
insert into public.list_senders(id,list_id,sender_email)
select sender,first_list,sender::text || '@dashboard-test.edu' from admin_test_context;
insert into public.list_senders(list_id,sender_email)
select outside_list,outside_list::text || '@dashboard-test.edu' from admin_test_context;
insert into public.list_subscriptions(user_id,list_id)
select u.id,c.first_list from admin_test_context c join public.users u on u.auth_id=c.student_auth;
insert into public.email_posts(id,email_id,title,status,list_id,institution_id,hashtags)
select post,post::text,'Dashboard test post','published',first_list,institution,array['Historical topic'] from admin_test_context;

-- Anonymous callers cannot read sender mappings or invoke protected RPCs.
set local role anon;
select pg_temp.check_test((select count(*)=0 from public.list_senders),'anonymous sender access');
do $$ begin
  begin perform public.admin_dashboard_counts((select institution from admin_test_context)); raise exception 'FAILED: anonymous RPC access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Normal students can still read their feed, but cannot manage institution resources.
select set_config('request.jwt.claim.sub',student_auth::text,true) from admin_test_context;
set local role authenticated;
select pg_temp.check_test(jsonb_array_length(public.get_user_feed()->'posts')=1,'student subscribed feed');
select pg_temp.check_test((select count(*)=0 from public.list_senders),'student sender privacy');
select pg_temp.check_test((select count(*)=0 from public.institution_admins),'student admin role privacy');
do $$ begin
  begin insert into public.list(tag,institution) select 'Forbidden',institution from admin_test_context; raise exception 'FAILED: student list creation';
  exception when insufficient_privilege then null; end;
  begin insert into public.institution_admins(user_id,institution_id,role) select u.id,c.institution,'admin' from admin_test_context c join public.users u on u.auth_id=c.student_auth; raise exception 'FAILED: self-assignment';
  exception when insufficient_privilege then null; end;
  begin perform public.assign_institution_admin_by_email((select institution from admin_test_context),'someone@dashboard-test.edu'); raise exception 'FAILED: student assignment RPC';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_dashboard_counts((select institution from admin_test_context)); raise exception 'FAILED: student overview';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Institution admins can manage their own lists and senders, but cannot appoint admins.
select set_config('request.jwt.claim.sub',admin_auth::text,true) from admin_test_context;
set local role authenticated;
select pg_temp.check_test((public.admin_dashboard_counts((select institution from admin_test_context))->>'administrators')::int=2,'admin full administrator count');
select pg_temp.check_test((select count(*)=1 from public.list_senders),'admin own-institution sender access');
insert into public.list(tag,institution,hashtags) select 'Created by admin',institution,array['Research Opportunities','Internships & Co-ops'] from admin_test_context;
update public.list set tag='Edited list', hashtags=array['New allowed topic'] where id=(select first_list from admin_test_context);
select pg_temp.check_test((select hashtags=array['New allowed topic'] from public.list where id=(select first_list from admin_test_context)),'text-array topic update');
select pg_temp.check_test((select hashtags=array['Historical topic'] from public.email_posts where id=(select post from admin_test_context)),'historical labels preserved');
update public.list_senders set list_id=(select second_list from admin_test_context) where id=(select sender from admin_test_context);
select pg_temp.check_test((select list_id=(select second_list from admin_test_context) from public.list_senders where id=(select sender from admin_test_context)),'move sender within institution');
select pg_temp.check_test((select list_id=(select first_list from admin_test_context) from public.email_posts where id=(select post from admin_test_context)),'historical routing preserved');
with added as (insert into public.list_senders(list_id,sender_email)
select second_list,first_list::text || '-added@dashboard-test.edu' from admin_test_context returning id)
select pg_temp.check_test((select count(*)=1 from added),'admin adds sender');
update public.list_senders set sender_email=(select first_list::text || '-edited@dashboard-test.edu' from admin_test_context)
where sender_email=(select first_list::text || '-added@dashboard-test.edu' from admin_test_context);
with removed as (delete from public.list_senders
where sender_email=(select first_list::text || '-edited@dashboard-test.edu' from admin_test_context) returning id)
select pg_temp.check_test((select count(*)=1 from removed),'admin edits and removes sender');
do $$ begin
  begin insert into public.list(tag,institution) select 'Forbidden outside list',other_institution from admin_test_context; raise exception 'FAILED: cross-institution list creation';
  exception when insufficient_privilege then null; end;
  begin insert into public.list_senders(list_id,sender_email) select first_list,sender::text || '@dashboard-test.edu' from admin_test_context; raise exception 'FAILED: duplicate sender mapping';
  exception when unique_violation then null; end;
  begin update public.list_senders set list_id=(select outside_list from admin_test_context) where id=(select sender from admin_test_context); raise exception 'FAILED: cross-institution sender move';
  exception when insufficient_privilege then null; end;
  begin update public.list set institution=(select other_institution from admin_test_context) where id=(select first_list from admin_test_context); raise exception 'FAILED: list institution reassignment';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_dashboard_counts((select other_institution from admin_test_context)); raise exception 'FAILED: cross-institution counts';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_institution_roster((select institution from admin_test_context)); raise exception 'FAILED: non-owner roster';
  exception when insufficient_privilege then null; end;
  begin perform public.assign_institution_admin_by_email((select institution from admin_test_context),(select student_auth::text || '@dashboard-test.edu' from admin_test_context)); raise exception 'FAILED: non-owner admin assignment';
  exception when insufficient_privilege then null; end;
end $$;
with removed as (delete from public.list where id=(select outside_list from admin_test_context) returning id)
select pg_temp.check_test((select count(*)=0 from removed),'cross-institution deletion blocked');
with removed as (delete from public.institution_admins where institution_id=(select institution from admin_test_context) returning user_id)
select pg_temp.check_test((select count(*)=0 from removed),'ordinary admin cannot remove admins');
reset role;

-- Owners assign by normalized email to the public profile ID and cannot promote/remove owners.
select set_config('request.jwt.claim.sub',owner_auth::text,true) from admin_test_context;
set local role authenticated;
select public.assign_institution_admin_by_email(institution,'  ' || upper(student_auth::text || '@dashboard-test.edu') || '  ') from admin_test_context;
select pg_temp.check_test((select count(*)=3 from public.admin_institution_roster((select institution from admin_test_context))),'owner roster includes assigned account');
select pg_temp.check_test((select a.role='admin' from public.institution_admins a join public.users u on u.id=a.user_id where u.auth_id=(select student_auth from admin_test_context)) is null,'profile privacy remains enforced');
-- Use roster to verify correct public.users.id without relaxing users RLS.
select pg_temp.check_test((select count(*)=1 from public.admin_institution_roster((select institution from admin_test_context)) where email=(select student_auth::text || '@dashboard-test.edu' from admin_test_context) and role='admin'),'email resolves eligible registered account');
do $$
declare outside_error text; missing_error text;
begin
  begin perform public.assign_institution_admin_by_email((select institution from admin_test_context),(select outsider_auth::text || '@dashboard-test.edu' from admin_test_context)); raise exception 'FAILED: cross-institution assignment';
  exception when sqlstate 'P0001' then get stacked diagnostics outside_error=message_text; end;
  begin perform public.assign_institution_admin_by_email((select institution from admin_test_context),'not-registered@dashboard-test.edu'); raise exception 'FAILED: nonexistent account assignment';
  exception when sqlstate 'P0001' then get stacked diagnostics missing_error=message_text; end;
  perform pg_temp.check_test(outside_error=missing_error and outside_error='No eligible registered account found in this institution','lookup avoids cross-institution enumeration');
  begin update public.institution_admins set role='owner' where role='admin'; raise exception 'FAILED: owner promotion';
  exception when insufficient_privilege then null; end;
end $$;
with removed as (delete from public.institution_admins where role='owner' and institution_id=(select institution from admin_test_context) returning user_id)
select pg_temp.check_test((select count(*)=0 from removed),'owner removal blocked');
with removed as (delete from public.institution_admins where role='admin' and institution_id=(select institution from admin_test_context) returning user_id)
select pg_temp.check_test((select count(*)=2 from removed),'owner removes regular administrators');
-- Delete behavior matches the warning shown to staff.
update public.list_senders set list_id=(select first_list from admin_test_context) where id=(select sender from admin_test_context);
delete from public.list where id=(select first_list from admin_test_context);
reset role;
select pg_temp.check_test((select count(*)=0 from public.list_senders where id=(select sender from admin_test_context)),'list deletion removes senders');
select pg_temp.check_test((select count(*)=0 from public.list_subscriptions where list_id=(select first_list from admin_test_context)),'list deletion removes subscriptions');
select pg_temp.check_test((select list_id is null from public.email_posts where id=(select post from admin_test_context)),'list deletion detaches historical posts');
rollback;
select 'PASS: anonymous/student/admin/owner authorization, tenant isolation, list CRUD, sender uniqueness and moves, topic arrays, historical preservation, email assignment, owner protection, and deletion behavior. All fixtures rolled back.' as result;
