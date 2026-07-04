-- Product option groups (modifiers) — STAGE 1: schema only, fully inert.
--
-- Adds a per-product "pick from a named group of choices" modifier concept,
-- distinct from bundles (which group several products). A product option
-- group is a required or optional choice attached to ONE product (e.g. a
-- salad's dressing, all same price; or a poke bowl's protein, priced
-- differently via price_delta_pence).
--
-- Nothing in the application reads or writes these tables yet. No existing
-- behaviour changes. Later stages add the Edge Function write/read paths and
-- the vendor/customer UI; create-order (the #427 pricing authority) will
-- resolve any price delta server-side from product_options.price_delta_pence,
-- never from the client.
--
-- Vendor scoping: none of these tables carry a vendor_id — they scope through
-- their parents exactly as products / order_items already do
-- (product_option_groups → products → vendor_id;
--  order_option_selections → order_items → orders → drops → vendor_id).
--
-- Access posture: service-role only, mirroring the `admins` and `comms_log`
-- tables. RLS is enabled with NO policies (denies anon + authenticated), and
-- grants are additionally revoked from those roles as defence-in-depth. All
-- access is via Edge Functions using the service-role client, which bypasses
-- RLS.
--
-- Uses plain CREATE TABLE (not IF NOT EXISTS) deliberately: if any of these
-- names already exists, the migration must fail loudly rather than silently
-- adopt a pre-existing table of unknown shape.

-- ---------------------------------------------------------------------------
-- Catalog: a named choice attached to one product.
-- ---------------------------------------------------------------------------
create table product_option_groups (
  id          uuid        primary key default gen_random_uuid(),
  product_id  uuid        not null references products(id) on delete cascade,
  name        text        not null,
  min_select  integer     not null default 1,
  max_select  integer     not null default 1,
  is_required boolean     not null default true,
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- FK-supporting index: "the option groups for this product".
create index idx_product_option_groups_product_id
  on product_option_groups (product_id);

-- ---------------------------------------------------------------------------
-- Catalog: the choices inside a group. price_delta_pence is the per-option
-- price adjustment (0 for same-price groups, e.g. salmon +£3 = 300).
-- ---------------------------------------------------------------------------
create table product_options (
  id                uuid        primary key default gen_random_uuid(),
  group_id          uuid        not null references product_option_groups(id) on delete cascade,
  name              text        not null,
  price_delta_pence integer     not null default 0,
  sort_order        integer     not null default 0,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);

-- FK-supporting index: "the options inside this group".
create index idx_product_options_group_id
  on product_options (group_id);

-- ---------------------------------------------------------------------------
-- Orders: which option a customer chose on an order line, snapshotted so
-- historical orders survive later edits/deletes of the option definitions.
-- The FKs to product_options / product_option_groups intentionally have NO
-- cascade: an option that has been ordered cannot be hard-deleted (retire it
-- with is_active = false instead); the snapshot columns are what reporting
-- reads.
-- ---------------------------------------------------------------------------
create table order_option_selections (
  id                        uuid        primary key default gen_random_uuid(),
  order_item_id             uuid        not null references order_items(id) on delete cascade,
  option_id                 uuid        not null references product_options(id),
  group_id                  uuid        not null references product_option_groups(id),
  option_name_snapshot      text        not null,
  price_delta_pence_snapshot integer    not null,
  created_at                timestamptz not null default now()
);

-- FK-supporting index: "the option selections for this order line".
create index idx_order_option_selections_order_item_id
  on order_option_selections (order_item_id);

-- ---------------------------------------------------------------------------
-- Security: service-role only. RLS enabled with no policies denies anon and
-- authenticated; the REVOKE strips Supabase's default broad grants as
-- defence-in-depth so a single stray future policy can't open a write path.
-- service_role bypasses RLS, which is how the Edge Functions reach these.
-- ---------------------------------------------------------------------------
alter table product_option_groups   enable row level security;
alter table product_options         enable row level security;
alter table order_option_selections enable row level security;

revoke all on product_option_groups   from anon, authenticated;
revoke all on product_options         from anon, authenticated;
revoke all on order_option_selections from anon, authenticated;
