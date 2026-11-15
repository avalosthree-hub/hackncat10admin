-- Institution settings govern future classification; historical email tags are untouched.
alter table public.institutions add column hashtags text[] not null default '{}';
with labels as (
 select l.institution,lower(btrim(t)) key,min(btrim(t)) label
 from public.list l cross join lateral unnest(l.hashtags) t
 where btrim(t)<>'' group by l.institution,lower(btrim(t))
), topics as (select institution,array_agg(label order by key) tags from labels group by institution)
update public.institutions i set hashtags=t.tags from topics t where i.id=t.institution;

-- No generic institution UPDATE policy: the RPC can modify only topics.
create function public.admin_set_institution_topics(p_institution uuid,p_topics text[],p_expected_topics text[] default null)
returns text[] language plpgsql security definer set search_path='' as $$
declare result text[];
begin
 if auth.uid() is null or not private.is_institution_admin(p_institution) then raise exception 'Administrator required' using errcode='42501';end if;
 if p_topics is null or cardinality(p_topics)>100 or exists(select 1 from unnest(p_topics) t where t is null or length(btrim(t))=0 or length(btrim(t))>100) then raise exception 'Use up to 100 nonempty topic labels of at most 100 characters';end if;
 select coalesce(array_agg(label order by first_seen),'{}') into result from (
  select lower(btrim(t)) key,(array_agg(btrim(t) order by n))[1] label,min(n) first_seen
  from unnest(p_topics) with ordinality x(t,n) group by lower(btrim(t))
 ) normalized;
 update public.institutions set hashtags=result where id=p_institution and (p_expected_topics is null or hashtags=p_expected_topics);
 if not found then raise exception 'Topics changed or institution unavailable. Refresh before saving.';end if;
 return result;
end $$;
revoke all on function public.admin_set_institution_topics(uuid,text[],text[]) from public,anon;
grant execute on function public.admin_set_institution_topics(uuid,text[],text[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('email-attachments','email-attachments',false,20971520);
-- Object paths are institution/post/attachment, so edited JSON cannot grant access to another post's file.
create policy "Read attachments of accessible emails" on storage.objects for select to authenticated using (
 bucket_id='email-attachments' and exists(
  select 1 from public.email_posts p
  where p.id::text=split_part(name,'/',2)
   and coalesce(p.institution_id::text,'unrouted')=split_part(name,'/',1)
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.attachments)='array' then p.attachments else '[]'::jsonb end) a
     where a->>'storage_path'=name and a->>'status'='stored')
 )
);
-- Browser roles cannot upload, overwrite or remove attachments. Ingestion uses the service role.

-- Existing student preferences consume institution-owned topics through the same RPC.
create or replace function public.get_feed_personalization()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile public.users%rowtype; preferences public.user_feed_preferences%rowtype;
begin
 perform private.ensure_feed_institution();
 select * into profile from public.users where auth_id=(select auth.uid());
 if profile.id is null then raise exception 'Your account profile is missing. Please contact support.'; end if;
 select * into preferences from public.user_feed_preferences where user_id=(select auth.uid());
 return jsonb_build_object(
 'institutionId',profile.institution_id,'isAdmin',private.is_institution_admin(profile.institution_id),
 'institutionName',(select name from public.institutions where id=profile.institution_id),
 'completed',preferences.onboarding_completed_at is not null,
 'interests',coalesce(preferences.interests,'{}'::text[]),
 'major',preferences.major,
 'majors',(select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.feed_majors),
 'lists',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.tag,'hashtags',(select i.hashtags from public.institutions i where i.id=l.institution),
 'subscribed',exists(select 1 from public.list_subscriptions s where s.list_id=l.id and s.user_id=profile.id)) order by l.tag,l.id)
 from public.list l where l.institution=profile.institution_id),'[]'::jsonb),
 'topics',coalesce((select jsonb_agg(topic order by topic) from (
 select distinct lower(trim(t)) topic from public.institutions i cross join lateral unnest(i.hashtags) t
 where i.id=profile.institution_id and trim(t)<>''
 union
 select distinct lower(trim(t)) from public.email_posts p cross join lateral unnest(p.hashtags) t
 where p.institution_id=profile.institution_id and p.status='published' and trim(t)<>''
 ) topics),'[]'::jsonb)
 );
end;
$$;

-- Include saved attachments beside original emails in Event Review.
create or replace function public.admin_event_original(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; institution uuid;
begin
 select institution_id into institution from public.events where id=p_event;
 if auth.uid() is null or institution is null or not private.is_institution_admin(institution) then raise exception 'Event unavailable' using errcode='42501';end if;
 select jsonb_build_object('id',p.id,'title',p.title,'sender',p.sender,'subject',p.subject,'raw_email',p.raw_email,'attachments',p.attachments,'event_times',p.event_times,'locations',p.locations) into result
 from public.events e join public.email_posts p on p.id=e.source_email_post_id and p.institution_id=e.institution_id and p.list_id=e.list_id where e.id=p_event;
 return result;
end $$;
