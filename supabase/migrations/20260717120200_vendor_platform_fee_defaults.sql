-- Vendors default to covering Stripe processing cost (1.5% + 20p).
--
-- Both platform-fee columns previously defaulted to 0, so every newly created
-- vendor started absorbing the Stripe fee. create-vendor omits both columns on
-- insert, so a column default is sufficient to make cost-recovery the default
-- for new vendors (existing rows are unaffected by a DEFAULT change).

alter table vendors
  alter column platform_fee_pct set default 1.5,
  alter column platform_fee_fixed_pence set default 20;
