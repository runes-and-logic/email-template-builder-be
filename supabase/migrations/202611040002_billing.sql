begin;
create table public.billing_checkouts (
 workspace_id uuid primary key references public.workspaces(id),
 token uuid unique not null default gen_random_uuid(),
 plan_id text not null references public.plans(id),
 interval text not null check(interval in ('monthly','yearly')),
 state text not null check(state in ('creating','ready','closed')),
 provider_id text unique,
 checkout_url text,
 created_at timestamptz not null default now()
);
alter table billing_checkouts enable row level security;
revoke all on billing_checkouts from anon,authenticated;
grant all on billing_checkouts to service_role;
grant select on billing_checkouts to authenticated;
create policy checkout_owner on billing_checkouts for select to authenticated using(exists(select 1 from workspace_members m where m.workspace_id=billing_checkouts.workspace_id and m.user_id=auth.uid() and m.role='owner'));
create function public.claim_checkout(w uuid, selected_plan text, billing_interval text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare current billing_checkouts;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and role='owner') then raise insufficient_privilege; end if;
 perform 1 from workspaces where id=w for update;
 if exists(select 1 from subscriptions where workspace_id=w and status in ('active','authenticated','pending','halted')) then raise exception 'subscription_exists'; end if;
 select * into current from billing_checkouts where workspace_id=w;
 if found and current.state<>'closed' then
  if current.state='creating' then raise exception 'checkout_in_progress'; end if;
  return to_jsonb(current);
 end if;
 if selected_plan='free' or billing_interval not in ('monthly','yearly') then raise exception 'invalid_plan'; end if;
 insert into billing_checkouts(workspace_id,plan_id,interval,state) values(w,selected_plan,billing_interval,'creating')
 on conflict(workspace_id) do update set token=gen_random_uuid(),plan_id=excluded.plan_id,interval=excluded.interval,state='creating',provider_id=null,checkout_url=null,created_at=now()
 returning * into current;
 return to_jsonb(current);
end $$;
revoke all on function claim_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function claim_checkout(uuid,text,text) to authenticated;
alter table subscriptions add column observed_at timestamptz not null default now();

drop function apply_subscription_event(text,text,uuid,text,text,text,timestamptz);
create function public.apply_subscription_event(event_id text, event_name text, w uuid, subscription_id text, selected_plan text, subscription_status text, ends_at timestamptz, observed timestamptz) returns boolean
language plpgsql security definer set search_path=public as $$
declare old subscriptions;
begin
 insert into webhook_events values(event_id,event_name,now()) on conflict do nothing;
 if not found then return false; end if;
 perform 1 from workspaces where id=w for update;
 -- An old subscription must never replace a newer checkout's subscription.
 if not exists(select 1 from billing_checkouts where workspace_id=w and provider_id=subscription_id) then return false; end if;
 select * into old from subscriptions where workspace_id=w;
 if found and old.provider_id=subscription_id then
  if old.observed_at>observed then return false; end if;
  if old.status in ('cancelled','completed','expired') and subscription_status not in ('cancelled','completed','expired') then return false; end if;
 end if;
 insert into subscriptions(workspace_id,provider_id,plan_id,status,current_end,updated_at,observed_at) values(w,subscription_id,selected_plan,subscription_status,ends_at,now(),observed)
 on conflict(workspace_id) do update set provider_id=excluded.provider_id,plan_id=excluded.plan_id,status=excluded.status,current_end=excluded.current_end,updated_at=now(),observed_at=excluded.observed_at;
 if subscription_status in ('cancelled','completed','expired') then update billing_checkouts set state='closed' where workspace_id=w and provider_id=subscription_id; end if;
 insert into audit_events(workspace_id,action,target) values(w,'subscription.reconciled',subscription_id);
 return true;
end $$;
revoke all on function apply_subscription_event(text,text,uuid,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function apply_subscription_event(text,text,uuid,text,text,text,timestamptz,timestamptz) to service_role;
commit;
