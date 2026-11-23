begin;
create function public.manage_member(w uuid, member_email text, member_role text) returns void
language plpgsql security definer set search_path=public as $$
declare member_id uuid;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and role='owner') or member_role not in ('editor','viewer','remove') then raise insufficient_privilege; end if;
 perform 1 from workspaces where id=w for update;
 select id into member_id from auth.users where lower(email)=lower(member_email) and email_confirmed_at is not null;
 if member_id is null or member_id=(select owner_id from workspaces where id=w) then raise exception 'member_unavailable'; end if;
 if member_role='remove' then delete from workspace_members where workspace_id=w and user_id=member_id;
 else insert into workspace_members values(w,member_id,member_role) on conflict(workspace_id,user_id) do update set role=excluded.role;
 end if;
 insert into audit_events(workspace_id,actor_id,action,target) values(w,auth.uid(),'membership.'||member_role,member_id::text);
end $$;
revoke all on function manage_member(uuid,text,text) from public,anon,authenticated;
grant execute on function manage_member(uuid,text,text) to authenticated;
commit;
