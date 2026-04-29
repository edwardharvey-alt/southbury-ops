-- remove_event_window — atomic delete of one window-group member,
-- with conditional clear of window_group_id on a sole survivor.
--
-- Called by the remove-event-window Edge Function. The Edge Function
-- handles auth, vendor ownership, and the orders-presence refusal in
-- TypeScript BEFORE invoking this RPC; this function trusts that
-- validated input and focuses on the multi-write atomic block:
--   1. Re-fetch window_group_id under FOR UPDATE (closes the TOCTOU
--      gap between the Edge Function's read and this delete).
--   2. Refuse if the drop is not part of a group (soloist drops use
--      transition-drop-status with target_status = archived instead).
--   3. Delete the drop. ON DELETE CASCADE on drops.id removes
--      drop_menu_items, drop_products, and (only if orders existed)
--      orders + order_status_events.
--   4. If the surviving group membership drops to exactly 1, clear
--      window_group_id on that survivor — the group has dissolved.
--
-- ----------------------------------------------------------------
-- SAFETY PROPERTY — THIS RPC ASSUMES THE CALLER HAS REFUSED ORDERS.
-- ----------------------------------------------------------------
-- drops.id is the cascade root for FOUR ON DELETE CASCADE FKs:
--   * orders.drop_id
--   * order_status_events.drop_id
--   * drop_menu_items.drop_id
--   * drop_products.drop_id
--
-- If this RPC is invoked on a drop that has orders, the cascade will
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
-- The orders-presence refusal (PR-4B-AUDIT.md Section 3.4 condition 7)
-- is the PRIMARY defence and is implemented in TypeScript inside the
-- remove-event-window Edge Function. Any future caller of this RPC
-- (e.g. an admin tool, a scheduled job) MUST replicate that check or
-- accept the cascade. Do not "tidy" this function to also do the
-- check inside the RPC — keeping the refusal in the Edge Function
-- preserves the structured 409 error body and matches the rest of
-- the Edge Function suite's refusal style.
-- ----------------------------------------------------------------

create or replace function public.remove_event_window(
  p_drop_id uuid
)
returns table (
  deleted_drop_id          uuid,
  survivor_drop_id         uuid,
  cascaded_drop_menu_items integer,
  group_dissolved          boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id  uuid;
  v_dmi_count integer;
  v_survivor  uuid;
  v_remaining integer;
  v_dissolved boolean;
begin
  -- Re-fetch the group id under FOR UPDATE so no concurrent
  -- handleCreateEventWindows / remove_event_window can race the
  -- post-delete coherence check.
  select window_group_id into v_group_id
  from drops
  where id = p_drop_id
  for update;

  if not found then
    raise exception 'Drop not found' using errcode = 'P0002';
  end if;

  if v_group_id is null then
    raise exception 'Drop is not part of a window group' using errcode = 'P0001';
  end if;

  -- Count drop_menu_items rows that will cascade with the delete.
  -- Informational — caller may surface "removed N items along with
  -- the window."
  select count(*) into v_dmi_count
  from drop_menu_items
  where drop_id = p_drop_id;

  delete from drops where id = p_drop_id;

  -- Post-delete coherence: if the surviving group has exactly one
  -- member, clear that member's window_group_id so the UI reverts
  -- from "edit existing windows" to "create windows" mode. The
  -- caller never names the survivor — this function determines it
  -- from the post-delete membership.
  select count(*) into v_remaining
  from drops
  where window_group_id = v_group_id;

  if v_remaining = 1 then
    select id into v_survivor
    from drops
    where window_group_id = v_group_id;

    update drops
       set window_group_id = null
     where id = v_survivor;
  end if;

  v_dissolved := (v_remaining <= 1);

  return query
    select p_drop_id, v_survivor, v_dmi_count, v_dissolved;
end
$$;

comment on function public.remove_event_window(uuid) is
  'Atomic delete of a window-group member. Clears window_group_id on '
  'the sole survivor when the group dissolves. Caller MUST refuse '
  'orders-presence BEFORE invoking — see PR-4B-AUDIT.md Section 5.2 '
  'for the three corruption surfaces (scorecard.html new-vs-returning, '
  'hearth-intelligence customer segmentation, order_status_events '
  'audit history) that the cascade would silently destroy.';
