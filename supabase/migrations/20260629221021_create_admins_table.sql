-- Backfills the `admins` table, originally created out-of-band in the SQL
-- editor with no migration. On existing environments this migration is
-- marked applied via `supabase migration repair` and never executed. On a
-- fresh DB it runs and recreates the table in its intended secure shape.

create table public.admins (
  id uuid not null default gen_random_uuid(),
  auth_user_id uuid not null,
  email text not null,
  granted_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint admins_pkey primary key (id),
  constraint admins_auth_user_id_key unique (auth_user_id),
  constraint admins_auth_user_id_fkey foreign key (auth_user_id)
    references auth.users(id) on delete cascade
);

create index idx_admins_auth_user_id_active
  on public.admins using btree (auth_user_id)
  where (is_active = true);

alter table public.admins enable row level security;
-- No policies, by design: with RLS enabled and zero policies, anon and
-- authenticated are denied all access; service_role bypasses RLS, which is
-- how the admin Edge Functions read this table.

revoke all on public.admins from anon, authenticated;
-- Defence-in-depth. The live table carries Supabase's default broad grants
-- to anon/authenticated, inert only because RLS-with-no-policies denies
-- them. On the admins table a single stray future policy would otherwise
-- open a privilege-escalation write path, so we make it service_role-only
-- at BOTH the grant and policy layers.
