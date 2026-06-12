-- Widen anon visibility to include 'closed' (drop the never-written 'scheduled'); keep 'live' and 'completed'.
-- Pre-req for the drop-status lifecycle engine: closed/completed drops must be readable by anon before the engine writes them.

CREATE OR REPLACE VIEW v_drop_public AS
 SELECT drop_id, slug, drop_name, drop_type, status, vendor_id, vendor_name,
        host_id, host_name, host_type, opens_at, closes_at, delivery_start,
        delivery_end, cutoff_time, capacity_category, capacity_category_id,
        capacity_category_name, capacity_units_total, capacity_units_used,
        capacity_units_remaining, product_count, fulfilment_mode, centre_postcode,
        radius_km, fundraising_enabled, fundraising_display_text, capacity_driver,
        capacity_categories
   FROM v_drop_summary
  WHERE status = ANY (ARRAY['live'::text, 'closed'::text, 'completed'::text]);

ALTER POLICY "Drops: anon select public statuses" ON drops
  USING (status = ANY (ARRAY['live'::text, 'closed'::text, 'completed'::text]));
