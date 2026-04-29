-- assign_drop_menu_items — bulk-replace reconcile for drop_menu_items.
--
-- Called by the assign-menu-items Edge Function. Atomically reconciles
-- a drop's menu assignments to match the supplied items[] array:
--   * Product items upsert by (drop_id, product_id).
--   * Bundle items upsert by (drop_id, bundle_id).
--   * Any drop_menu_items row for this drop not represented in p_items
--     is deleted.
-- All three steps run inside the function's implicit transaction, so the
-- drop is never observed half-saved.
--
-- Empty / null p_items: the upsert blocks no-op (jsonb_array_elements
-- yields zero rows), the delete clears every row for the drop. This is
-- the correct bulk-replace semantic for "vendor disabled every menu
-- item." Edge Function whitelists the request body shape; the RPC
-- trusts validated input.
--
-- ----------------------------------------------------------------
-- SAFETY PROPERTY — DO NOT "TIDY" THIS FUNCTION TO CASCADE INTO ORDERS.
-- ----------------------------------------------------------------
-- order_items.product_id and order_items.bundle_id reference products
-- and bundles directly — NOT drop_menu_items. Snapshot fields
-- (item_name_snapshot, capacity_units_snapshot, price_pence on
-- order_items) preserve historical order display when a drop_menu_items
-- row is removed mid-drop. That decoupling is what makes bulk-replace
-- safe.
--
-- A future contributor adding a cascading delete on order_items, or a
-- schema migration that FKs order_items against drop_menu_items, would
-- silently corrupt three downstream surfaces (per PR-4B-AUDIT.md
-- Section 5.2):
--
--   1. scorecard.html new-vs-returning classification — priorCustomers
--      is built from orders.customer_email; lost orders demote
--      returning customers to "new" on every future scorecard run.
--   2. hearth-intelligence.js customer segmentation — segmentCustomers()
--      partitions on order_count; lost orders silently demote
--      loyalCore customers to occasional / lapsed.
--   3. order_status_events audit history — the "draft → scheduled →
--      live → closed" trail is gone with no replacement.
--
-- The reconcile in this function MUST remain decoupled from order
-- history. If a future schema change needs to FK order rows against
-- drop_menu_items, the design of bulk-replace must be revisited
-- BEFORE the FK lands.
-- ----------------------------------------------------------------

create or replace function public.assign_drop_menu_items(
  p_drop_id uuid,
  p_items   jsonb
)
returns setof public.drop_menu_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
begin
  -- Upsert product items by (drop_id, product_id).
  insert into drop_menu_items (
    drop_id, item_type, menu_item_type,
    product_id, bundle_id, is_available,
    price_override_pence, stock_limit, sort_order,
    created_at, updated_at
  )
  select
    p_drop_id,
    'product',
    'product',
    (r->>'product_id')::uuid,
    null::uuid,
    coalesce((r->>'is_available')::boolean, true),
    nullif(r->>'price_override_pence', '')::integer,
    nullif(r->>'stock_limit', '')::integer,
    nullif(r->>'sort_order', '')::integer,
    v_now,
    v_now
  from jsonb_array_elements(v_items) as r
  where r->>'item_type' = 'product'
  on conflict (drop_id, product_id) do update
    set is_available         = excluded.is_available,
        price_override_pence = excluded.price_override_pence,
        stock_limit          = excluded.stock_limit,
        sort_order           = excluded.sort_order,
        item_type            = excluded.item_type,
        menu_item_type       = excluded.menu_item_type,
        updated_at           = v_now;

  -- Upsert bundle items by (drop_id, bundle_id).
  insert into drop_menu_items (
    drop_id, item_type, menu_item_type,
    product_id, bundle_id, is_available,
    price_override_pence, stock_limit, sort_order,
    created_at, updated_at
  )
  select
    p_drop_id,
    'bundle',
    'bundle',
    null::uuid,
    (r->>'bundle_id')::uuid,
    coalesce((r->>'is_available')::boolean, true),
    nullif(r->>'price_override_pence', '')::integer,
    nullif(r->>'stock_limit', '')::integer,
    nullif(r->>'sort_order', '')::integer,
    v_now,
    v_now
  from jsonb_array_elements(v_items) as r
  where r->>'item_type' = 'bundle'
  on conflict (drop_id, bundle_id) do update
    set is_available         = excluded.is_available,
        price_override_pence = excluded.price_override_pence,
        stock_limit          = excluded.stock_limit,
        sort_order           = excluded.sort_order,
        item_type            = excluded.item_type,
        menu_item_type       = excluded.menu_item_type,
        updated_at           = v_now;

  -- Delete drop_menu_items rows for this drop that are not in the
  -- desired set. NOTE: per the safety header above, this delete only
  -- removes drop_menu_items rows. order_items rows are decoupled and
  -- survive. Do not extend this delete to cascade into order history.
  delete from drop_menu_items dmi
  where dmi.drop_id = p_drop_id
    and not exists (
      select 1
      from jsonb_array_elements(v_items) as r
      where (
        (r->>'item_type' = 'product' and dmi.product_id = (r->>'product_id')::uuid)
        or
        (r->>'item_type' = 'bundle'  and dmi.bundle_id  = (r->>'bundle_id')::uuid)
      )
    );

  return query
    select *
    from drop_menu_items
    where drop_id = p_drop_id
    order by sort_order nulls last, created_at;
end
$$;

comment on function public.assign_drop_menu_items(uuid, jsonb) is
  'Bulk-replace reconcile for drop_menu_items. Atomic upsert + delete '
  'driven by p_items[]. MUST NOT be tidied to cascade-delete '
  'order_items — see PR-4B-AUDIT.md Section 5.2 for the three '
  'corruption surfaces (scorecard.html new-vs-returning, '
  'hearth-intelligence customer segmentation, order_status_events '
  'audit history) that depend on order history surviving menu edits.';
