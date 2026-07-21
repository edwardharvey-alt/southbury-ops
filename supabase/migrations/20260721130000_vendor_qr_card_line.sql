-- T-CAP-2b PR1 — vendor QR card line (data layer)
--
-- An optional single line, written by the vendor in their own words, to be
-- printed on the durable vendor QR card (T-CAP-2 — the artefact that lives for
-- months on a sticker, van or counter, pointing at the permanent vendor page).
--
-- This migration is the data layer only. It does NOT build the QR generator and
-- nothing renders the card yet — PR2 does that. The column lands first so the
-- vendor can write the line before there is a card to print it on.
--
-- Verified on live before authoring: no column resembling qr_card_line,
-- card_line or poster_line exists on public.vendors, and nothing in the repo
-- references such a name.
--
-- Nullable, no default, no backfill. Both live vendors correctly start NULL,
-- which is the honest value: they have not written a line. NULL is a supported
-- end state, not a gap to be filled — the card is designed to read correctly
-- without the line, and a vendor who has nothing to say should leave it blank.
-- A default would put words in their mouth, which is the one thing this field
-- must never do.

alter table public.vendors
  add column qr_card_line text;

-- Last line of defence, below the input's maxlength (soft, UI-only) and the
-- update-vendor validation (the real guard, because that function is callable
-- outside the Brand page).
--
-- The btrim in the length test is what makes the "empty means NULL" rule
-- enforceable: a whitespace-only string trims to zero length and so fails the
-- 1..60 range, which means the only way to store "nothing" is a true NULL. An
-- empty string can never reach this column and there is no second way to
-- express absence.
alter table public.vendors
  add constraint vendors_qr_card_line_length
  check (
    qr_card_line is null
    or char_length(btrim(qr_card_line)) between 1 and 60
  );

comment on column public.vendors.qr_card_line is
  'Optional vendor-written line printed on the durable vendor QR card. Max 60 chars. Null means the card renders without it.';
