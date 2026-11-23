begin;
create extension if not exists pgcrypto;

create table public.plans (
  id text primary key,
  name text not null,
  document_limit integer not null check(document_limit > 0),
  asset_limit bigint not null check(asset_limit > 0),
  monthly_paise integer not null check(monthly_paise >= 0),
  yearly_paise integer not null check(yearly_paise >= 0),
  razorpay_monthly_id text unique,
  razorpay_yearly_id text unique
);
insert into public.plans values
 ('free','Free',3,10485760,0,0,null,null),
 ('starter','Starter',25,104857600,29900,287040,null,null),
 ('pro','Pro',100,524288000,79900,767040,null,null),
 ('business','Business',500,2147483648,199900,1919040,null,null);

create table public.workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null default 'My workspace' check(length(name) between 1 and 100),
 created_at timestamptz not null default now()
);
create unique index one_personal_workspace on public.workspaces(owner_id);
create table public.workspace_members (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','editor','viewer')),
 primary key(workspace_id,user_id)
);
create index member_workspaces on public.workspace_members(user_id);
create table public.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('super_admin','operations','billing','content','support'))
);
create table public.documents (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 name text not null check(length(name) between 1 and 200),
 category text not null,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=4000000),
 revision integer not null default 1 check(revision > 0),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(workspace_id,id)
);
create index document_listing on public.documents(workspace_id,updated_at desc) where deleted_at is null;
create table public.document_versions (
 workspace_id uuid not null,
 document_id text not null,
 revision integer not null,
 content jsonb not null,
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(workspace_id,document_id,revision),
 foreign key(workspace_id,document_id) references public.documents(workspace_id,id) on delete cascade
);
create table public.workspace_resources (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check(kind in ('brand','blocks')),
 content jsonb not null check(octet_length(content::text)<=3000000),
 revision integer not null default 1,
 primary key(workspace_id,kind)
);
create table public.assets (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 object_key text unique not null,
 size bigint not null check(size between 1 and 1500000),
 mime text not null check(mime in ('image/png','image/jpeg','image/gif','image/webp')),
 created_at timestamptz not null default now()
);
create table public.subscriptions (
 workspace_id uuid primary key references public.workspaces(id),
 provider_id text unique not null,
 plan_id text not null references public.plans(id),
 status text not null,
 current_end timestamptz,
 updated_at timestamptz not null default now()
);
create table public.webhook_events (
 provider_event_id text primary key,
 event_type text not null,
 processed_at timestamptz not null default now()
);
create table public.audit_events (
 id bigint generated always as identity primary key,
 workspace_id uuid references public.workspaces(id),
 actor_id uuid references auth.users(id),
 action text not null,
 target text,
 created_at timestamptz not null default now()
);
create index audit_listing on public.audit_events(workspace_id,created_at desc);
create table public.template_catalog (
 id text primary key check(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 name text not null,
 category text not null,
 content jsonb not null check(octet_length(content::text)<=4000000),
 published boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.rate_buckets (
 user_id uuid not null references auth.users(id) on delete cascade,
 action text not null,
 window_start timestamptz not null,
 count integer not null,
 primary key(user_id,action)
);

create function public.is_member(w uuid, write_access boolean default false) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and (not write_access or role in ('owner','editor')))
$$;
create function public.is_admin(roles text[] default array['super_admin']) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from platform_admins where user_id=auth.uid() and (role='super_admin' or role=any(roles)))
$$;
create function public.ensure_workspace() returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 select id into w from workspaces where owner_id=auth.uid();
 if w is null then
  insert into workspaces(owner_id) values(auth.uid()) on conflict(owner_id) do update set owner_id=excluded.owner_id returning id into w;
  insert into workspace_members values(w,auth.uid(),'owner') on conflict do nothing;
 end if;
 return w;
end $$;
create function public.effective_plan(w uuid) returns text language sql stable security definer set search_path=public as $$
 select coalesce((select plan_id from subscriptions where workspace_id=w and status='active' and current_end>now() and (is_member(w) or is_admin(array['billing']))),'free')
$$;
create function public.consume_rate(action_name text, max_count integer default 20) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if auth.uid() is null or action_name not in ('test_email','checkout','write') then raise insufficient_privilege; end if;
 -- Caller cannot raise server-defined limits.
 max_count := case action_name when 'test_email' then 5 when 'checkout' then 5 else 120 end;
 insert into rate_buckets values(auth.uid(),action_name,now(),1)
 on conflict(user_id,action) do update set
 count=case when rate_buckets.window_start<now()-interval '1 minute' then 1 else rate_buckets.count+1 end,
 window_start=case when rate_buckets.window_start<now()-interval '1 minute' then now() else rate_buckets.window_start end
 returning count into n;
 return n<=max_count;
end $$;
create function public.save_document(w uuid, payload jsonb, expected_revision integer) returns integer
language plpgsql security definer set search_path=public as $$
declare old documents; next_revision integer; limit_count integer;
begin
 if not is_member(w,true) then raise insufficient_privilege; end if;
 if expected_revision is null or expected_revision<0 then raise exception 'revision_conflict'; end if;
 if not consume_rate('write') then raise exception 'quota_exceeded'; end if;
 if payload->>'version'<>'2' or payload->>'id' is null or length(payload->>'name') not between 1 and 200 or jsonb_typeof(payload->'blocks')<>'array' or jsonb_array_length(payload->'blocks')>300 then raise exception 'invalid_document'; end if;
 perform 1 from workspaces where id=w for update;
 select * into old from documents where workspace_id=w and id=payload->>'id' for update;
 if found then
  if old.revision<>expected_revision or old.deleted_at is not null then raise exception 'revision_conflict'; end if;
  next_revision:=old.revision+1;
 else
  if expected_revision<>0 then raise exception 'revision_conflict'; end if;
  select document_limit into limit_count from plans where id=effective_plan(w);
  if (select count(*) from documents where workspace_id=w and deleted_at is null)>=limit_count then raise exception 'quota_exceeded'; end if;
  next_revision:=1;
 end if;
 insert into documents(workspace_id,id,name,category,content,revision) values(w,payload->>'id',payload->>'name',payload->>'category',payload,next_revision)
 on conflict(workspace_id,id) do update set name=excluded.name,category=excluded.category,content=excluded.content,revision=excluded.revision,updated_at=now();
 insert into document_versions values(w,payload->>'id',next_revision,payload,auth.uid(),now());
 delete from document_versions where workspace_id=w and document_id=payload->>'id' and revision<=next_revision-20;
 insert into audit_events(workspace_id,actor_id,action,target) values(w,auth.uid(),'document.saved',payload->>'id');
 return next_revision;
end $$;
create function public.set_document_deleted(w uuid, document_id text, expected_revision integer, deleted boolean) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if not is_member(w,true) then raise insufficient_privilege; end if;
 perform 1 from workspaces where id=w for update;
 if not deleted and (select count(*) from documents where workspace_id=w and deleted_at is null)>=(select document_limit from plans where id=effective_plan(w)) then raise exception 'quota_exceeded'; end if;
 update documents set deleted_at=case when deleted then now() else null end,revision=revision+1,updated_at=now()
 where workspace_id=w and id=document_id and revision=expected_revision returning revision into n;
 if n is null then raise exception 'revision_conflict'; end if;
 insert into audit_events(workspace_id,actor_id,action,target) values(w,auth.uid(),case when deleted then 'document.deleted' else 'document.restored' end,document_id);
 return n;
end $$;
create function public.save_resource(w uuid, resource_kind text, payload jsonb, expected_revision integer) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if not is_member(w,true) then raise insufficient_privilege; end if;
 if expected_revision is null or expected_revision<0 then raise exception 'revision_conflict'; end if;
 if not consume_rate('write') then raise exception 'quota_exceeded'; end if;
 perform 1 from workspaces where id=w for update;
 select revision into n from workspace_resources where workspace_id=w and kind=resource_kind;
 if coalesce(n,0)<>expected_revision then raise exception 'revision_conflict'; end if;
 n:=coalesce(n,0)+1;
 insert into workspace_resources values(w,resource_kind,payload,n) on conflict(workspace_id,kind) do update set content=excluded.content,revision=excluded.revision;
 insert into audit_events(workspace_id,actor_id,action,target) values(w,auth.uid(),'resource.saved',resource_kind);
 return n;
end $$;
create function public.reserve_asset(w uuid, asset_id uuid, object_path text, byte_size bigint, mime_type text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(w,true) or split_part(object_path,'/',1)<>w::text or split_part(object_path,'/',2)<>asset_id::text then raise insufficient_privilege; end if;
 perform 1 from workspaces where id=w for update;
 if coalesce((select sum(size) from assets where workspace_id=w),0)+byte_size>(select asset_limit from plans where id=effective_plan(w)) then raise exception 'quota_exceeded'; end if;
 insert into assets(id,workspace_id,object_key,size,mime) values(asset_id,w,object_path,byte_size,mime_type);
end $$;

-- Apply webhook effects and record deduplication in one transaction. Only the server service role may invoke this.
create function public.apply_subscription_event(event_id text, event_name text, w uuid, subscription_id text, selected_plan text, subscription_status text, ends_at timestamptz) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 insert into webhook_events values(event_id,event_name,now()) on conflict do nothing;
 if not found then return false; end if;
 perform 1 from workspaces where id=w for update;
 insert into subscriptions values(w,subscription_id,selected_plan,subscription_status,ends_at,now())
 on conflict(workspace_id) do update set provider_id=excluded.provider_id,plan_id=excluded.plan_id,status=excluded.status,current_end=excluded.current_end,updated_at=now();
 insert into audit_events(workspace_id,action,target) values(w,'subscription.reconciled',subscription_id);
 return true;
end $$;

alter table plans enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table platform_admins enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table workspace_resources enable row level security;
alter table assets enable row level security;
alter table subscriptions enable row level security;
alter table webhook_events enable row level security;
alter table audit_events enable row level security;
alter table template_catalog enable row level security;
alter table rate_buckets enable row level security;
create policy plans_read on plans for select using(true);
create policy workspaces_read on workspaces for select to authenticated using(is_member(id) or is_admin(array['operations','support']));
create policy members_read on workspace_members for select to authenticated using(is_member(workspace_id) or is_admin(array['operations','support']));
create policy own_admin_role on platform_admins for select to authenticated using(user_id=auth.uid());
create policy documents_read on documents for select to authenticated using(is_member(workspace_id));
create policy versions_read on document_versions for select to authenticated using(is_member(workspace_id));
create policy resources_read on workspace_resources for select to authenticated using(is_member(workspace_id));
create policy assets_read on assets for select to authenticated using(is_member(workspace_id));
create policy assets_cleanup on assets for delete to authenticated using(is_member(workspace_id,true));
create policy subscriptions_read on subscriptions for select to authenticated using(is_member(workspace_id) or is_admin(array['billing']));
create policy audit_read on audit_events for select to authenticated using(is_member(workspace_id) or is_admin(array['operations']));
create policy catalog_read on template_catalog for select using(published or is_admin(array['content']));
create policy catalog_write on template_catalog for all to authenticated using(is_admin(array['content'])) with check(is_admin(array['content']));

-- Do not inherit Supabase's broad default table grants for sensitive tables.
revoke all on all tables in schema public from anon, authenticated;
grant select on plans,template_catalog to anon,authenticated;
grant select on workspaces,workspace_members,platform_admins,documents,document_versions,workspace_resources,assets,subscriptions,audit_events to authenticated;
grant insert,update,delete on template_catalog to authenticated;
grant delete on assets to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function is_member(uuid,boolean),is_admin(text[]) to anon,authenticated;
grant execute on function ensure_workspace(),consume_rate(text,integer),save_document(uuid,jsonb,integer),set_document_deleted(uuid,text,integer,boolean),save_resource(uuid,text,jsonb,integer),reserve_asset(uuid,uuid,text,bigint,text),effective_plan(uuid) to authenticated;
grant execute on function apply_subscription_event(text,text,uuid,text,text,text,timestamptz) to service_role;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Public URLs are necessary for exported emails. Random object paths are not a confidentiality boundary.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('email-assets','email-assets',true,1500000,array['image/png','image/jpeg','image/gif','image/webp']);
-- Uploads go through the server so byte size and MIME cannot bypass quota checks.
create policy asset_delete on storage.objects for delete to authenticated using(bucket_id='email-assets' and exists(select 1 from public.assets a where a.object_key=name and public.is_member(a.workspace_id,true)));
create policy asset_select on storage.objects for select to authenticated using(bucket_id='email-assets' and exists(select 1 from public.assets a where a.object_key=name and public.is_member(a.workspace_id)));
commit;
