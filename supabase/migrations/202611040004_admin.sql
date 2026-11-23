begin;
create function public.platform_records(section text, page_number integer default 0, query_text text default '') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare rows jsonb; total bigint; allowed text[];
begin
 allowed:=case section when 'users' then array['operations','support'] when 'workspaces' then array['operations','support'] when 'subscriptions' then array['billing'] when 'plans' then array['billing'] when 'templates' then array['content'] when 'audit' then array['operations'] when 'roles' then array['super_admin'] else array[]::text[] end;
 if cardinality(allowed)=0 or not is_admin(allowed) then raise insufficient_privilege; end if;
 page_number:=greatest(0,least(10000,page_number));
 query_text:='%'||replace(replace(left(query_text,200),'%','\%'),'_','\_')||'%';
 if section='users' then
  select count(*) into total from auth.users where email ilike query_text;
  select coalesce(jsonb_agg(t),'[]') into rows from (select id,email,created_at,email_confirmed_at from auth.users where email ilike query_text order by created_at desc limit 20 offset page_number*20) t;
 elsif section='workspaces' then
  select count(*) into total from workspaces where name ilike query_text;
  select coalesce(jsonb_agg(t),'[]') into rows from (select id,name,owner_id,created_at from workspaces where name ilike query_text order by created_at desc limit 20 offset page_number*20) t;
 elsif section='subscriptions' then
  select count(*) into total from subscriptions where provider_id ilike query_text;
  select coalesce(jsonb_agg(t),'[]') into rows from (select workspace_id,provider_id,plan_id,status,current_end from subscriptions where provider_id ilike query_text order by updated_at desc limit 20 offset page_number*20) t;
 elsif section='plans' then
  select count(*) into total from plans;
  select coalesce(jsonb_agg(t),'[]') into rows from (select * from plans order by monthly_paise) t;
 elsif section='templates' then
  select count(*) into total from template_catalog where name ilike query_text;
  select coalesce(jsonb_agg(t),'[]') into rows from (select id,name,category,published,updated_at from template_catalog where name ilike query_text order by updated_at desc limit 20 offset page_number*20) t;
 elsif section='audit' then
  select count(*) into total from audit_events where action ilike query_text;
  select coalesce(jsonb_agg(t),'[]') into rows from (select * from audit_events where action ilike query_text order by created_at desc limit 20 offset page_number*20) t;
 elsif section='roles' then
  select count(*) into total from platform_admins;
  select coalesce(jsonb_agg(t),'[]') into rows from (select a.user_id,u.email,a.role from platform_admins a join auth.users u on u.id=a.user_id order by u.email limit 20 offset page_number*20) t;
 end if;
 return jsonb_build_object('rows',rows,'count',total);
end $$;
create function public.platform_template(template_id text, payload jsonb, publish boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_admin(array['content']) then raise insufficient_privilege; end if;
 insert into template_catalog(id,name,category,content,published) values(template_id,payload->>'name',payload->>'category',payload,publish)
 on conflict(id) do update set name=excluded.name,category=excluded.category,content=excluded.content,published=excluded.published,updated_at=now();
 insert into audit_events(actor_id,action,target) values(auth.uid(),'catalog.saved',template_id);
end $$;
create function public.platform_plan(plan_key text, template_limit integer, storage_limit bigint, monthly_provider text, yearly_provider text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_admin(array['billing']) then raise insufficient_privilege; end if;
 update plans set document_limit=template_limit,asset_limit=storage_limit,razorpay_monthly_id=nullif(monthly_provider,''),razorpay_yearly_id=nullif(yearly_provider,'') where id=plan_key;
 if not found then raise exception 'not_found'; end if;
 insert into audit_events(actor_id,action,target) values(auth.uid(),'plan.updated',plan_key);
end $$;
create function public.platform_role(member_email text, selected_role text) returns void
language plpgsql security definer set search_path=public as $$
declare target_id uuid;
begin
 if not is_admin() or selected_role not in ('super_admin','operations','billing','support','content','remove') then raise insufficient_privilege; end if;
 select id into target_id from auth.users where lower(email)=lower(member_email) and email_confirmed_at is not null;
 if target_id is null or target_id=auth.uid() then raise exception 'member_unavailable'; end if;
 if selected_role='remove' then delete from platform_admins where user_id=target_id;
 else insert into platform_admins values(target_id,selected_role) on conflict(user_id) do update set role=excluded.role;
 end if;
 insert into audit_events(actor_id,action,target) values(auth.uid(),'platform_role.'||selected_role,target_id::text);
end $$;
revoke all on function platform_records(text,integer,text),platform_template(text,jsonb,boolean),platform_plan(text,integer,bigint,text,text),platform_role(text,text) from public,anon,authenticated;
grant execute on function platform_records(text,integer,text),platform_template(text,jsonb,boolean),platform_plan(text,integer,bigint,text,text),platform_role(text,text) to authenticated;
revoke insert,update,delete on template_catalog from authenticated;
commit;
