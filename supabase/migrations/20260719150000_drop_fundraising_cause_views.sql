-- Fundraising: expose the cause through the view layer.
--
-- Pairs with 20260719140000_drop_fundraising_cause.sql, which added
-- drops.fundraising_cause_name (public) and drops.fundraising_cause_reference
-- (private, operator-only). This migration is what makes them readable.
--
-- ORDER MATTERS: v_drop_public selects FROM v_drop_summary, so the summary view
-- must carry a column before the public view can project it. v_drop_summary is
-- replaced first below. Do not reorder the two statements.
--
-- APPEND ONLY. Both view bodies are the LIVE definitions, captured from
-- pg_get_viewdef on 2026-07-19, with new columns added at the END of the SELECT
-- list and nothing else touched. CREATE OR REPLACE VIEW cannot reorder, rename,
-- retype or remove an existing column (error 42P16) — appending is the only
-- safe shape (operational learning #26).
--
--
-- WHAT EACH VIEW GAINS
--
-- v_drop_summary (operator + host; REVOKEd from anon) gains BOTH new columns:
--   fundraising_cause_name, fundraising_cause_reference
--
--   The private column is safe here, and that safety is load-bearing enough to
--   write down. Of the four readers of this view, two use select('*') —
--   get-drop and list-drops — but both verify the JWT via auth.getUser() and
--   scope to the caller's own vendor.id, so the reference only ever reaches the
--   vendor who owns the drop. It is their own remittance note. The host path,
--   host-view-summary, uses a NAMED column projection that does not include it,
--   so hosts never receive it. create-order likewise uses a named list.
--
--   >>> If host-view-summary is ever changed to select('*'), the private
--   >>> reference leaks to every host. Keep it a named projection.
--
-- v_drop_public (customer-facing, anon-readable) gains FOUR columns:
--   fundraising_model, fundraising_per_order_pence, fundraising_percentage,
--   fundraising_cause_name
--
--   These let the order page compose an accurate contribution line from data
--   ("£3 from every order goes to Southbury Food Bank") rather than depending on
--   the vendor to restate the amount and the cause in free-text display copy.
--
--   fundraising_cause_reference is DELIBERATELY ABSENT and must stay absent.
--   order.html reads this view with select('*') in two places, so every column
--   here lands in the customer's browser. A charity number or internal
--   remittance note is a disclosure with no upside to the customer.
--
--
-- EXISTING BEHAVIOUR IS UNCHANGED. Every column any current reader names is
-- still present, in the same position, with the same type. order.html's
-- select('*') simply receives four extra fields it does not yet reference.
-- Nothing is removed and no existing value changes.
--
--
-- NOT DONE HERE: neither new column is in update-drop's ALLOWED_FIELDS, so both
-- are still silently stripped on save until that whitelist is widened. That is a
-- paired Edge Function change on the deploy-before-merge workflow. Until it
-- ships, these view columns will read NULL for every drop — correctly, because
-- nothing can write them yet.

-- Capture the security posture before replacing, so the guard at the foot of
-- this file can prove neither view's definer/invoker status moved. A silent
-- flip here is the failure mode from operational learnings #48/#49/#52: the
-- symptom is not an error, it is every operator page rendering empty.
CREATE TEMP TABLE _view_security_before AS
SELECT c.relname::text AS relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('v_drop_summary', 'v_drop_public');


-- ---------------------------------------------------------------------------
-- 1. v_drop_summary — append fundraising_cause_name + fundraising_cause_reference
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
    -- APPENDED 2026-07-19 — new columns go at the END, never mid-list.
    d.fundraising_cause_name,
    d.fundraising_cause_reference
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
           d.fundraising_cause_name, d.fundraising_cause_reference;


-- ---------------------------------------------------------------------------
-- 2. v_drop_public — append the amount fields + the PUBLIC cause name only
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
    -- APPENDED 2026-07-19. fundraising_cause_reference is deliberately NOT here
    -- and must never be added — order.html reads this view with select('*').
    fundraising_model,
    fundraising_per_order_pence,
    fundraising_percentage,
    fundraising_cause_name
   FROM v_drop_summary
  WHERE status = ANY (ARRAY['live'::text, 'closed'::text, 'completed'::text]);


-- ---------------------------------------------------------------------------
-- 3. Guard — abort if either view's definer/invoker posture moved.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW is expected to preserve reloptions, but a silent
-- change here would be invisible until operator pages started rendering empty,
-- so this asserts rather than assumes. Raising inside the migration transaction
-- rolls both view replacements back.
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
