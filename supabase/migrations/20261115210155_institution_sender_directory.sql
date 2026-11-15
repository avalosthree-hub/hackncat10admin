create table public.institution_senders(
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 sender_email text not null check(sender_email=lower(btrim(sender_email)) and length(sender_email) between 3 and 254 and sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 created_at timestamptz not null default now(),
 unique(institution_id,sender_email)
);
alter table public.institution_senders enable row level security;
grant select,insert on public.institution_senders to authenticated;
grant all on public.institution_senders to service_role;
create policy "Admins read institution sender directory" on public.institution_senders for select to authenticated using((select private.is_institution_admin(institution_id)));
create policy "Admins add institution senders" on public.institution_senders for insert to authenticated with check((select private.is_institution_admin(institution_id)));
insert into public.institution_senders(institution_id,sender_email)
select distinct l.institution,s.sender_email from public.list_senders s join public.list l on l.id=s.list_id where l.institution is not null;

alter table public.list_senders drop constraint list_senders_sender_email_key;
alter table public.list_senders add constraint list_senders_list_email_key unique(list_id,sender_email);
create index list_senders_email_idx on public.list_senders(sender_email);
-- Newly entered addresses are saved once in the institution directory, including direct API writes.
create function private.save_approved_sender() returns trigger language plpgsql security invoker set search_path='' as $$
declare institution uuid;
begin
 select l.institution into institution from public.list l where l.id=new.list_id;
 if institution is null then raise exception 'Mailing list unavailable';end if;
 insert into public.institution_senders(institution_id,sender_email) values(institution,new.sender_email) on conflict(institution_id,sender_email) do nothing;
 return new;
end $$;
revoke all on function private.save_approved_sender() from public,anon,authenticated;
create trigger save_approved_sender before insert or update of list_id,sender_email on public.list_senders for each row execute function private.save_approved_sender();

-- A provider email may have one published post per approved list.
alter table public.email_posts add column provider_email_id text;
-- Existing rows remain untouched; ingestion recognizes their original email_id as a legacy key.
create unique index email_posts_provider_list_idx on public.email_posts(provider_email_id,list_id);
-- Delivery snapshots make retries idempotent and prevent newly added approvals backfilling old mail.
create table public.email_deliveries(
 email_id text primary key,
 list_ids uuid[] not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from anon,authenticated;
grant all on public.email_deliveries to service_role;
