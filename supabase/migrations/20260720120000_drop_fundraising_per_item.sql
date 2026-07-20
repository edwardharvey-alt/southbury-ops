-- Fundraising: a third model — a fixed amount per ITEM.
--
-- Today a drop raises money one of two ways: a flat amount per ORDER
-- (fundraising_model = 'per_order' + fundraising_per_order_pence) or a
-- PERCENTAGE of the order (fundraising_model = 'percentage' +
-- fundraising_percentage). This adds a third: a flat amount per item UNIT, where
-- an order's item count is SUM(order_items.qty) across every line — product or
-- bundle, one bundle line counting as its own quantity, with NO descent into
-- order_item_selections (3 nuts + 1 water = 4 units).
--
-- TWO PARTS, one per file, in the family's established shape:
--   A (this file) — the column + the model-name CHECK widen.
--   B (…_views.sql) — the view layer: the money-total maths in
--     v_drop_fundraising_summary, plus the customer-safe amount appended to
--     v_drop_summary and v_drop_public.
--
--
-- fundraising_per_item_pence — PUBLIC amount, same family as
-- fundraising_per_order_pence. The pence a drop contributes for each item unit
-- in an order. Nullable, integer, no default: every existing drop gets NULL and
-- nothing is rewritten, exactly like the fundraising_cause_* columns
-- (20260719140000). "Required when the model is per_item" is an APP-LAYER rule,
-- enforced in update-drop's ALLOWED_FIELDS validation and the transition-drop-
-- status publish gate (both land in PR 2), mirroring how per_order requires a
-- positive fundraising_per_order_pence. The DB's job here is only to hold the
-- value; a NOT NULL column could not say "required only for one model" without a
-- table CHECK, and a CHECK would put that rule in two places that drift apart.
--
--
-- THE CHECK WIDEN. drops_fundraising_model_check today reads:
--   CHECK ((fundraising_model IS NULL) OR
--          (fundraising_model = ANY (ARRAY['percentage','per_order'])))
-- It was created ad hoc (not by any repo migration), so — following the exact
-- pattern proven in 20260705120000_drop_audience_scope_direct.sql — this drops
-- ANY check constraint on public.drops that references fundraising_model,
-- whatever its name, then recreates the canonical widened one. Safe if the
-- constraint is somehow already gone (the loop finds nothing; the ADD installs
-- it fresh). Every existing row is 'percentage', 'per_order' or NULL, all of
-- which stay valid under the widened constraint, so the ADD cannot fail on
-- current data.
--
-- BEFORE RUNNING (dev first), confirm the constraint this replaces:
--   SELECT conname, pg_get_constraintdef(oid) AS def
--   FROM pg_constraint
--   WHERE conrelid = 'public.drops'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%fundraising_model%';
--
--
-- EXISTING BEHAVIOUR IS UNCHANGED. Adding a nullable column cannot break a
-- select('*') reader, and no narrowed column list in the codebase names this
-- field yet. Widening a CHECK to permit an additional value rejects nothing that
-- was accepted before. Nothing reads or writes fundraising_per_item_pence until
-- PR 2, so no current surface changes.
--
-- NOT DONE HERE, and required before anything can write the field: it is not yet
-- in update-drop's ALLOWED_FIELDS, so it is silently stripped on save until that
-- whitelist is widened (operational learning #26 — a schema change has a write
-- side and a read side, and either alone is silently broken). That, the publish
-- gate, and every rendering surface are PR 2, on the deploy-before-merge
-- workflow — deliberately not bundled here.

ALTER TABLE public.drops
  ADD COLUMN IF NOT EXISTS fundraising_per_item_pence integer;

COMMENT ON COLUMN public.drops.fundraising_per_item_pence IS
  'PUBLIC. Pence contributed per item unit for the per_item fundraising model; an order''s item count is SUM(order_items.qty) across all lines (a bundle counts as its own line quantity, no descent into selections). Safe to expose in customer-facing views (same family as fundraising_per_order_pence). Nullable; required-when-model-is-per_item is enforced in the update-drop Edge Function and the publish gate, mirroring fundraising_per_order_pence.';


-- Widen the model CHECK to admit 'per_item'. Drop-any-then-recreate, matching
-- 20260705120000_drop_audience_scope_direct.sql — the constraint was created ad
-- hoc so its name is not guaranteed from source.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.drops'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%fundraising_model%'
  LOOP
    EXECUTE format('ALTER TABLE public.drops DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.drops
  ADD CONSTRAINT drops_fundraising_model_check
  CHECK (
    fundraising_model IS NULL
    OR fundraising_model = ANY (ARRAY['percentage'::text, 'per_order'::text, 'per_item'::text])
  );
