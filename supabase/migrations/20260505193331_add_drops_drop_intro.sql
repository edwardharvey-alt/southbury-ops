-- T4-31: drop_intro — short customer-facing "this week's story" copy
-- shown on order.html as a warm-tinted card between hero and menu.
--
-- Nullable text. Trimmed/length-validated by the update-drop Edge
-- Function (≤ 280 chars). Empty / null hides the card on the order
-- page entirely so the layout flows hero → menu with no gap.

ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS drop_intro text;

COMMENT ON COLUMN drops.drop_intro IS
  'Short customer-facing copy ("this week''s story") rendered above the menu on order.html. ≤ 280 chars enforced by update-drop Edge Function.';
