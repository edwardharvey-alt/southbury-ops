-- T5-A3 Priority 2, Half A — column-safe public views for the anonymous
-- customer order page (order.html).
--
-- These two DEFINER views mirror v_drop_public: anon reads them, and the only
-- safety mechanism is column restriction (no PII columns are projected). They
-- carry NO security_invoker and NO WHERE row-filter — the caller scopes by id
-- (.eq('id', ...)). order.html re-points its two anon reads onto these views so
-- the base vendors / hosts tables (and their PII columns) are no longer read by
-- the anon role on the customer order path.
--
-- NOT in scope here (Half B): the boot read in hearth-vendor.js still depends on
-- anon SELECT on the vendors table, so vendors_select_all and all RLS policies
-- are left untouched. The REVOKE is a separate later capstone.

-- v_vendor_public — 11 customer-safe branding/identity columns. Verbatim of the
-- column list order.html already selected from vendors.
CREATE VIEW v_vendor_public AS
SELECT
  id,
  display_name,
  name,
  tagline,
  logo_url,
  hero_image_url,
  website_url,
  brand_primary_color,
  brand_secondary_color,
  brand_text_on_primary,
  powered_by_hearth_visible
FROM vendors;

-- v_host_public — only the host columns order.html genuinely consumes. Excludes
-- all PII (contact_email, contact_phone, contact_name, notes_internal) and every
-- other internal/operational column.
CREATE VIEW v_host_public AS
SELECT
  id,
  name,
  host_type
FROM hosts;

GRANT SELECT ON v_vendor_public, v_host_public TO anon, authenticated;
