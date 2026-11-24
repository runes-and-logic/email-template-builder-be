-- Paid checkout is on hold (PAYMENTS_ENABLED=false), so nobody can upgrade.
-- Raise the Free plan to Starter-level limits until billing opens again.
-- To restore the original limits: document_limit=3, asset_limit=10485760 (10 MB).
update public.plans
set document_limit = 25,
    asset_limit = 104857600 -- 100 MB
where id = 'free';
