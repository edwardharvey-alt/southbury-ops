-- Capacity: derive consumed capacity from LIVE HOLDS, in units, not pizzas.
--
-- Problem this closes: consumed capacity was SUM(orders.pizzas) over
-- status <> 'cancelled'. A pending_payment order therefore held its slot for
-- its FULL life and was only released when something flipped its status to
-- 'cancelled' (the Stripe checkout.session.expired webhook, or the reconcile
-- cron). If that webhook is dropped and the cron isn't running, the slot is
-- held forever — capacity is lost permanently (audit:
-- audit/findings-capacity-abandoned-checkout.md).
--
-- Fix: route ALL consumed-capacity reads through public.drop_capacity_consumed(),
-- which counts a pending_payment order ONLY while its 30-minute hold is live
-- (expires_at IS NULL OR expires_at > now()). Once the hold lapses the order
-- stops consuming capacity automatically, with no status flip required. Units
-- come from orders.capacity_units_consumed (written by create_order_atomic from
-- p_incoming_consumption), so the legacy orders.pizzas / drops.capacity_pizzas
-- columns are removed.
--
-- IDEMPOTENT: safe to run over the partially-hand-applied live state
--   * public.drop_capacity (legacy view) — already dropped by hand
--   * public.drop_capacity_consumed(uuid) — already created by hand
--   * v_drop_capacity_usage, create_order_atomic — still on the old logic
--   * orders.pizzas, drops.capacity_pizzas — still present
-- Every statement below is drop-if-exists / create-or-replace / drop-column-if-exists.
--
-- >>> REQUIRED MANUAL STEP <<< This migration is NOT complete as committed.
-- STEP 4 (create_order_atomic) MUST be pasted from the live DB body before this
-- file is applied — see the STEP 4 banner. The STEP 5 guard aborts the
-- destructive column drops if that paste is missing, so a partial/forgotten run
-- cannot corrupt data.
--
-- Paired change: supabase/functions/create-order/index.ts drops the dead
-- `pizzas` key from the RPC payload. See the PR for the exact deploy/apply order.

-- STEP 1 — remove the legacy aggregate view (no-op: already dropped by hand).
drop view if exists public.drop_capacity;

-- STEP 2 — hold-aware consumed-capacity function. A pending_payment order counts
-- ONLY while its hold is live (expires_at null or in the future); a lapsed hold
-- stops consuming capacity without needing a status flip. (No-op replace if the
-- hand-applied body already matches this.)
create or replace function public.drop_capacity_consumed(p_drop_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(capacity_units_consumed), 0)
  from public.orders
  where drop_id = p_drop_id
    and status <> 'cancelled'
    and (status <> 'pending_payment' or expires_at is null or expires_at > now());
$$;

-- STEP 3 — usage view now derives used/remaining from the hold-aware function.
-- NOTE: create-or-replace-view cannot change an existing view's column set/order/
-- types (error 42P16). The column list below is the shape v_drop_summary /
-- v_drop_public already read; if this raises 42P16, the live view's columns
-- differ and must be reconciled (its dependents block a plain CASCADE drop —
-- see the PR).
create or replace view public.v_drop_capacity_usage as
  select d.id as drop_id, d.name as drop_name, d.status as drop_status,
         d.capacity_category, d.capacity_units_total,
         public.drop_capacity_consumed(d.id) as capacity_units_used,
         greatest(d.capacity_units_total::numeric - public.drop_capacity_consumed(d.id), 0::numeric)
           as capacity_units_remaining
  from public.drops d;

-- ============================================================================
-- STEP 4 — create_order_atomic (RPC) — >>> ED PASTES THE EDITED BODY HERE <<<
-- ----------------------------------------------------------------------------
-- The deployed create_order_atomic body is hand-applied and NOT in the repo, so
-- it cannot be reconstructed here (must not be reconstructed from memory).
-- Fetch the CURRENT live body, apply EXACTLY TWO edits, and paste the full
-- `create or replace function public.create_order_atomic(p_order jsonb,
-- p_incoming_consumption numeric) ...` statement in place of this banner.
--
-- Fetch the live body:
--   select pg_get_functiondef('public.create_order_atomic(jsonb, numeric)'::regprocedure);
--
-- Edit (a): replace the inline consumed-capacity gate
--     v_already := (select coalesce(sum(capacity_units_consumed), 0)
--                     from public.orders
--                    where drop_id = v_drop_id and status <> 'cancelled');
--   with the hold-aware function call:
--     v_already := public.drop_capacity_consumed(v_drop_id);
--   (This is the money-path change: pending holds past expires_at stop counting.)
--
-- Edit (b): remove `pizzas` from BOTH the INSERT column list AND the value/
--   SELECT list of the orders insert. Remove any residual `pizzas` token,
--   comments included (the STEP 5 guard trips on any occurrence).
--
-- Preserve `SELECT ... FOR UPDATE` (the drop-row lock) and EVERY other line
-- unchanged. Signature MUST stay (p_order jsonb, p_incoming_consumption numeric).
-- ============================================================================

-- STEP 5 — guard: refuse to drop the legacy columns while the live RPC still
-- references `pizzas` (i.e. STEP 4 was skipped or edit (b) was incomplete).
-- Aborts before any destructive change; nothing above this point is destructive.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_order_atomic'
      and p.prosrc ilike '%pizzas%'
  ) then
    raise exception
      'create_order_atomic still references "pizzas" — paste the edited RPC body (STEP 4) with edit (b) applied before dropping the legacy columns';
  end if;
end $$;

-- STEP 6 — drop the corrupt legacy capacity columns. `drop column if exists`
-- (no CASCADE) will itself abort if a view/function still depends on the column;
-- if that happens, reconcile the dependent first (see the pre-apply dependency
-- check in the PR).
alter table public.orders drop column if exists pizzas;
alter table public.drops  drop column if exists capacity_pizzas;
