-- v_vendor_public pre-existed as a 23-column PII-safe branding view; reused as-is. This migration creates only v_host_public. order.html selects its 11 vendor columns by name.
--
-- T5-A3 Priority 2, Half A — column-safe public view for the anonymous
-- customer order page (order.html).
--
-- v_host_public is a DEFINER view mirroring v_drop_public: anon reads it, and the
-- only safety mechanism is column restriction (no PII columns are projected). It
-- carries NO security_invoker and NO WHERE row-filter — the caller scopes by id
-- (.eq('id', ...)). order.html re-points its anon host read onto this view so the
-- base hosts table (and its PII columns) is no longer read by the anon role on the
-- customer order path. The vendor read re-points onto the pre-existing
-- v_vendor_public (no new vendor view is created here).
--
-- NOT in scope here (Half B): the boot read in hearth-vendor.js still depends on
-- anon SELECT on the vendors table, so vendors_select_all and all RLS policies
-- are left untouched. The REVOKE is a separate later capstone.

-- v_host_public — only the host columns order.html genuinely consumes. Excludes
-- all PII (contact_email, contact_phone, contact_name, notes_internal) and every
-- other internal/operational column.
CREATE VIEW v_host_public AS
SELECT
  id,
  name,
  host_type
FROM hosts;

GRANT SELECT ON v_host_public TO anon, authenticated;

-- Idempotent re-grant on the pre-existing v_vendor_public (harmless if the grant
-- already exists); ensures the anon order path can read it regardless.
GRANT SELECT ON v_vendor_public TO anon, authenticated;
