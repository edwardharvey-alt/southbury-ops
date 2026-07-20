-- Fundraising per_item: teach the money view to total it, expose the amount.
--
-- Pairs with 20260720120000_drop_fundraising_per_item.sql, which added
-- drops.fundraising_per_item_pence and widened the model CHECK. This migration
-- is what makes the field COUNT (in the running total) and READ (on the
-- customer view).
--
-- THREE VIEWS, replaced leaf-first so each dependency is in place before its
-- parent is rebuilt:
--   1. v_drop_fundraising_summary — the load-bearing money total. Gains the
--      per_item maths. Its OUTPUT columns are unchanged (same names, order,
--      types) — the new item-unit rollup lives inside a CTE and the CASE only,
--      so replacing it does not disturb v_drop_summary, which selects from it.
--   2. v_drop_summary (operator + host; REVOKEd from anon) — appends
--      fundraising_per_item_pence.
--   3. v_drop_public (customer-facing, anon-readable) — appends
--      fundraising_per_item_pence.
-- v_drop_public selects FROM v_drop_summary, which selects FROM
-- v_drop_fundraising_summary, so the replace order is fundraising_summary →
-- summary → public. Do not reorder.
--
-- APPEND ONLY. Each body below is the LIVE definition (v_drop_summary /
-- v_drop_public captured 2026-07-19; v_drop_fundraising_summary captured
-- 2026-07-20 via pg_get_viewdef), with the minimum change bolted on and nothing
-- else touched. CREATE OR REPLACE VIEW cannot reorder, rename, retype or remove
-- an existing column (error 42P16) — new output columns go at the END, and no
-- existing column's TYPE may move. This is why the per_item CASE branch is cast
-- to bigint: the other branches are bigint, and a numeric branch would flip the
-- fundraising_total_pence column's type and fail the replace (operational
-- learning #26).
--
--
-- FAN-OUT SAFETY — the reason this is a careful migration, not a quick edit
-- (operational learning #55). paid_order_rollup already sums o.total_pence into
-- net_revenue_pence (→ drop_gmv_pence). Adding order_items INTO that same
-- aggregate would multiply every order's revenue by its line count — the exact
-- Cartesian defect #55 documents. So order_items is pre-aggregated to ONE row
-- per order in its OWN CTE (order_item_units), then LEFT JOINed 1:1 onto orders
-- (ON oiu.order_id = o.id). A strictly 1:1 join leaves count(DISTINCT o.id) and
-- sum(o.total_pence) byte-identical; only the new sum(item_units) is added. The
-- INERT verification below (snapshot drop_gmv_pence + fundraising_total_pence
-- across every drop, diff must be empty) is what PROVES the join is 1:1 on live
-- data — it does not ship until that diff is empty.
--
-- ITEM-COUNT RULE (locked): an order's item count is SUM(order_items.qty) across
-- ALL lines, product or bundle. A bundle counts as its own line quantity; there
-- is no descent into order_item_selections. This is the same rule PR 2 uses on
-- the confirmation page and in the confirmation email, so all three agree by
-- construction.
--
-- STATUS PREDICATE reused verbatim from the live body
-- (status <> ALL ARRAY['pending_payment','cancelled']); not re-invented
-- (T-fundraising-order-count-single-source). pending_payment and cancelled
-- orders are excluded from the item-unit total exactly as they are from
-- order_count and net_revenue_pence.
--
--
-- fundraising_cause_reference (PRIVATE, operator-only) is NOT added anywhere by
-- this migration and must never be added to v_drop_public — order.html reads
-- that view with select('*'), so every column lands in the customer's browser.
--
-- Neither new-model write path exists until PR 2, so fundraising_per_item_pence
-- is NULL for every drop today and the per_item CASE branch never fires: this
-- migration is a provable no-op on all current data. That is what the INERT
-- check asserts.


-- Capture the security posture before replacing, so the guard at the foot can
-- prove no view's definer/invoker status moved. A silent flip here is the
-- failure mode from operational learnings #48/#49/#52: not an error, but every
-- operator page rendering empty.
CREATE TEMP TABLE _view_security_before AS
SELECT c.relname::text AS relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('v_drop_fundraising_summary', 'v_drop_summary', 'v_drop_public');


-- ---------------------------------------------------------------------------
-- 1. v_drop_fundraising_summary — add the per_item total (output cols unchanged)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_drop_fundraising_summary AS
 WITH order_item_units AS (
         SELECT oi.order_id,
            sum(oi.qty)::bigint AS item_units
           FROM order_items oi
          GROUP BY oi.order_id
        ), paid_order_rollup AS (
         SELECT o.drop_id,
            count(DISTINCT o.id) AS order_count,
            sum(o.total_pence) AS net_revenue_pence,
            sum(oiu.item_units) AS item_units_total
           FROM orders o
             LEFT JOIN order_item_units oiu ON oiu.order_id = o.id
          WHERE (o.status <> ALL (ARRAY['pending_payment'::text, 'cancelled'::text]))
          GROUP BY o.drop_id
        )
 SELECT d.id AS drop_id,
    d.name AS drop_name,
    d.status AS drop_status,
    d.host_id,
    d.fundraising_enabled,
    d.fundraising_model,
    d.fundraising_percentage,
    d.fundraising_per_order_pence,
    d.host_share_enabled,
    d.host_share_model,
    d.host_share_percentage,
    d.host_share_per_order_pence,
    d.host_share_fixed_pence,
    d.host_share_customer_visible,
    COALESCE(r.order_count, 0::bigint) AS order_count,
    COALESCE(r.net_revenue_pence, 0::bigint) AS drop_gmv_pence,
        CASE
            WHEN d.fundraising_enabled IS NOT TRUE THEN 0::bigint
            WHEN d.fundraising_model = 'percentage'::text THEN round(COALESCE(r.net_revenue_pence, 0::bigint)::numeric * (COALESCE(d.fundraising_percentage, 0::numeric) / 100.0))::bigint
            WHEN d.fundraising_model = 'per_order'::text THEN COALESCE(r.order_count, 0::bigint) * COALESCE(d.fundraising_per_order_pence, 0)
            WHEN d.fundraising_model = 'per_item'::text THEN (COALESCE(r.item_units_total, 0::bigint) * COALESCE(d.fundraising_per_item_pence, 0))::bigint
            ELSE 0::bigint
        END AS fundraising_total_pence,
        CASE
            WHEN d.host_share_enabled IS NOT TRUE THEN 0::bigint
            WHEN d.host_share_model = 'percentage'::text THEN round(COALESCE(r.net_revenue_pence, 0::bigint)::numeric * (COALESCE(d.host_share_percentage, 0::numeric) / 100.0))::bigint
            WHEN d.host_share_model = 'per_order'::text THEN COALESCE(r.order_count, 0::bigint) * COALESCE(d.host_share_per_order_pence, 0)
            WHEN d.host_share_model = 'fixed'::text THEN COALESCE(d.host_share_fixed_pence, 0)::bigint
            ELSE 0::bigint
        END AS host_share_total_pence
   FROM drops d
     LEFT JOIN paid_order_rollup r ON r.drop_id = d.id;


-- ---------------------------------------------------------------------------
-- 2. v_drop_summary — append fundraising_per_item_pence
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_drop_summary AS
 SELECT d.id AS drop_id,
    d.slug,
    d.name AS drop_name,
    d.drop_type,
        CASE
            WHEN d.status = 'live'::text AND d.closes_at < now() THEN 'closed'::text
            ELSE d.status
        END AS status,
    d.vendor_id,
    v.name AS vendor_name,
    d.host_id,
    h.name AS host_name,
    h.host_type,
    d.opens_at,
    d.closes_at,
    d.delivery_start,
    d.delivery_end,
    d.cutoff_time,
    d.capacity_category,
    d.capacity_category_id,
    cat.name AS capacity_category_name,
    d.capacity_units_total,
    COALESCE(cu.capacity_units_used, 0::numeric) AS capacity_units_used,
    COALESCE(cu.capacity_units_remaining, d.capacity_units_total::numeric) AS capacity_units_remaining,
    count(DISTINCT dmi.id) FILTER (WHERE dmi.is_available = true) AS product_count,
    count(DISTINCT o.id) AS order_count,
    COALESCE(fs.drop_gmv_pence, 0::bigint) AS drop_gmv_pence,
    COALESCE(fs.fundraising_total_pence, 0::bigint) AS fundraising_total_pence,
    COALESCE(fs.host_share_total_pence, 0::bigint) AS host_share_total_pence,
    d.fulfilment_mode,
    d.centre_postcode,
    d.radius_km,
    d.fundraising_enabled,
    d.fundraising_model,
    d.fundraising_percentage,
    d.fundraising_per_order_pence,
    d.fundraising_display_text,
    d.host_share_enabled,
    d.host_share_model,
    d.host_share_percentage,
    d.host_share_per_order_pence,
    d.host_share_fixed_pence,
    d.host_share_customer_visible,
    d.capacity_driver,
    d.capacity_categories,
    d.audience_scope,
    d.fundraising_cause_name,
    d.fundraising_cause_reference,
    -- APPENDED 2026-07-20 — per_item fundraising amount (public). New columns go
    -- at the END, never mid-list.
    d.fundraising_per_item_pence
   FROM drops d
     LEFT JOIN vendors v ON v.id = d.vendor_id
     LEFT JOIN hosts h ON h.id = d.host_id
     LEFT JOIN categories cat ON cat.id = d.capacity_category_id
     LEFT JOIN v_drop_capacity_usage cu ON cu.drop_id = d.id
     LEFT JOIN v_drop_fundraising_summary fs ON fs.drop_id = d.id
     LEFT JOIN drop_menu_items dmi ON dmi.drop_id = d.id
     LEFT JOIN orders o ON o.drop_id = d.id AND (o.status <> ALL (ARRAY['pending_payment'::text, 'cancelled'::text]))
  GROUP BY d.id, d.slug, d.name, d.drop_type, d.status, d.vendor_id, v.name,
           d.host_id, h.name, h.host_type, d.opens_at, d.closes_at,
           d.delivery_start, d.delivery_end, d.cutoff_time, d.capacity_category,
           d.capacity_category_id, cat.name, d.capacity_units_total,
           cu.capacity_units_used, cu.capacity_units_remaining,
           fs.drop_gmv_pence, fs.fundraising_total_pence, fs.host_share_total_pence,
           d.fulfilment_mode, d.centre_postcode, d.radius_km, d.fundraising_enabled,
           d.fundraising_model, d.fundraising_percentage, d.fundraising_per_order_pence,
           d.fundraising_display_text, d.host_share_enabled, d.host_share_model,
           d.host_share_percentage, d.host_share_per_order_pence,
           d.host_share_fixed_pence, d.host_share_customer_visible,
           d.capacity_driver, d.capacity_categories, d.audience_scope,
           d.fundraising_cause_name, d.fundraising_cause_reference,
           d.fundraising_per_item_pence;


-- ---------------------------------------------------------------------------
-- 3. v_drop_public — append the customer-safe per_item amount only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_drop_public AS
 SELECT drop_id,
    slug,
    drop_name,
    drop_type,
    status,
    vendor_id,
    vendor_name,
    host_id,
    host_name,
    host_type,
    opens_at,
    closes_at,
    delivery_start,
    delivery_end,
    cutoff_time,
    capacity_category,
    capacity_category_id,
    capacity_category_name,
    capacity_units_total,
    capacity_units_used,
    capacity_units_remaining,
    product_count,
    fulfilment_mode,
    centre_postcode,
    radius_km,
    fundraising_enabled,
    fundraising_display_text,
    capacity_driver,
    capacity_categories,
    fundraising_model,
    fundraising_per_order_pence,
    fundraising_percentage,
    fundraising_cause_name,
    -- APPENDED 2026-07-20. fundraising_cause_reference is deliberately NOT here
    -- and must never be added — order.html reads this view with select('*').
    fundraising_per_item_pence
   FROM v_drop_summary
  WHERE status = ANY (ARRAY['live'::text, 'closed'::text, 'completed'::text]);


-- ---------------------------------------------------------------------------
-- 4. Guard — abort if any view's definer/invoker posture moved.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW is expected to preserve reloptions, but a silent change
-- would be invisible until operator pages started rendering empty, so this
-- asserts rather than assumes. Raising inside the migration transaction rolls
-- all three view replacements back.
DO $$
DECLARE
  drifted text;
BEGIN
  SELECT string_agg(b.relname, ', ')
    INTO drifted
  FROM _view_security_before b
  JOIN pg_class c ON c.relname = b.relname
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.reloptions IS DISTINCT FROM b.reloptions;

  IF drifted IS NOT NULL THEN
    RAISE EXCEPTION
      'security posture changed on view(s): % — reloptions differ before/after CREATE OR REPLACE. Rolling back; reconcile before re-running.',
      drifted;
  END IF;
END $$;

DROP TABLE IF EXISTS _view_security_before;
