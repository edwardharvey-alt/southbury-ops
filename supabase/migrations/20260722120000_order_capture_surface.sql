-- Ticket 4 core (PR1): order arrival surface. Metadata only.
-- Never read by pricing / total / fee re-derivation. Nullable by design:
-- existing orders and un-stamped arrivals legitimately have no known surface (=> NULL).
alter table public.orders
  add column if not exists capture_surface text;

comment on column public.orders.capture_surface is
  'Provenance: surface this order arrived through (vendor_page|drop_qr|host_poster|activation_poster|followup|reactivation). Sanitised server-side in create-order; NULL if absent/unrecognised. Metadata only; never used in total/fee derivation. Placement (counter/table/van/flyer) is NOT stored here — it lives on the customer capture/follow record.';
