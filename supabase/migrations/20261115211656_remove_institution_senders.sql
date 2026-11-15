-- Tie approvals to their directory entry so every deletion path removes approvals atomically.
alter table public.list_senders add column directory_sender_id uuid;
update public.list_senders s set directory_sender_id=d.id
from public.list l,public.institution_senders d
where l.id=s.list_id and d.institution_id=l.institution and d.sender_email=s.sender_email;
alter table public.list_senders alter column directory_sender_id set not null;
alter table public.list_senders add constraint list_senders_directory_fkey foreign key(directory_sender_id) references public.institution_senders(id) on delete cascade;
create index list_senders_directory_idx on public.list_senders(directory_sender_id);
create or replace function private.save_approved_sender() returns trigger language plpgsql security invoker set search_path='' as $$
declare institution uuid;
begin
 select l.institution into institution from public.list l where l.id=new.list_id;
 if institution is null then raise exception 'Mailing list unavailable';end if;
 insert into public.institution_senders(institution_id,sender_email) values(institution,new.sender_email) on conflict(institution_id,sender_email) do nothing;
 select id into new.directory_sender_id from public.institution_senders where institution_id=institution and sender_email=new.sender_email;
 return new;
end $$;
revoke all on function private.save_approved_sender() from public,anon,authenticated;
drop trigger save_approved_sender on public.list_senders;
create trigger save_approved_sender before insert or update on public.list_senders for each row execute function private.save_approved_sender();

grant delete on public.institution_senders to authenticated;
create policy "Admins remove institution senders" on public.institution_senders for delete to authenticated using((select private.is_institution_admin(institution_id)));
create function public.admin_remove_institution_sender(p_institution uuid,p_sender uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare address text;
begin
 if auth.uid() is null or not private.is_institution_admin(p_institution) then raise exception 'Administrator required' using errcode='42501';end if;
 delete from public.institution_senders where id=p_sender and institution_id=p_institution returning sender_email into address;
 if address is null then raise exception 'Sender unavailable. Refresh and try again.';end if;
end $$;
revoke all on function public.admin_remove_institution_sender(uuid,uuid) from public,anon;
grant execute on function public.admin_remove_institution_sender(uuid,uuid) to authenticated;
