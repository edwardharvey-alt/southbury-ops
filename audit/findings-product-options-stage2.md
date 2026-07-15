# Findings — Product options (modifiers) Stage 2: server write & read paths

**Date:** 2026-07-04
**Base:** `main` @ `7c18c7b` ("feat(schema): product-options tables — Stage 1 (inert, schema only) (#429)")
**Type:** Read-only audit. No edits, commits, or PRs. Facts only — no design, no recommendations.
**Method:** Grep-first, evidence-first, `file:line` quotes. Live-DB-only facts flagged **NEEDS-ED-VERIFY** with exact SQL.
**Scope:** ONLY the server-side write and read paths the vendor-facing option-group editor
(a new `stageSection` in `drop-menu.html`'s product pane) needs. The UI is already understood and
out of scope. `order_option_selections` is the checkout-time write (create-order, a later stage) —
not part of the editor's paths, noted where relevant.

---

## Q1 — The write path

### Q1a — `save-bundle-line/index.ts` (read in full) — the composite-write template

This is the established template for "save a parent-owned row **plus** its child rows" and is the
closest model for saving an option group + its options.

**Auth (JWT via header → `getUser`):** `save-bundle-line/index.ts:34-45`
```ts
const authHeader = req.headers.get("Authorization");
if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

const anonClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);
const { data: { user }, error: authError } = await anonClient.auth.getUser(
  authHeader.replace("Bearer ", "")
);
if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
```

**Vendor scoping (caller owns the vendor):** `save-bundle-line/index.ts:72-84`
```ts
const { data: vendor, error: ownershipError } = await serviceClient
  .from("vendors")
  .select("id")
  .eq("id", vendor_id)
  .eq("auth_user_id", user.id)
  .maybeSingle();
...
if (!vendor) {
  return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
}
```

**Tenancy belt (parent belongs to the resolved vendor):** `save-bundle-line/index.ts:86-97`
```ts
// Tenancy belt: parent bundle belongs to the resolved vendor.
const { data: parentBundle, error: bundleLookupError } = await serviceClient
  .from("bundles")
  .select("id, vendor_id")
  .eq("id", bundle_id)
  .maybeSingle();
...
if (parentBundle.vendor_id !== vendor.id) {
  return jsonResponse({ error: "Bundle not owned by vendor" }, 403);
}
```

**Whitelist + server-set parent FK (never trusts client for the row's parent id):** `save-bundle-line/index.ts:99-107`
```ts
// Build whitelisted payload. Server sets bundle_id, never trusts the
// body's bundle_id field for the row payload (that's only used for
// the assertion above).
const payload: Record<string, unknown> = { bundle_id };
for (const key of Object.keys(fields)) {
  if (ALLOWED_FIELDS.has(key)) {
    payload[key] = fields[key];
  }
}
```

**Child-row write = DELETE-AND-REINSERT (not upsert).** On the update path the children are wiped
then re-inserted: `save-bundle-line/index.ts:139-156`
```ts
if (lineType === "choice_set") {
  const { error: deleteError } = await serviceClient
    .from("bundle_line_choice_products")
    .delete()
    .eq("bundle_line_id", bundle_line_id);
  if (deleteError) return jsonResponse({ error: deleteError.message }, 400);

  if (choiceIds.length) {
    const rows = choiceIds.map((productId, index) => ({
      bundle_line_id,
      product_id: productId,
      sort_order: (index + 1) * 10,
    }));
    const { error: insertError } = await serviceClient
      .from("bundle_line_choice_products")
      .insert(rows);
    if (insertError) return jsonResponse({ error: insertError.message }, 400);
  }
}
```
On the insert path the children are inserted after the parent, with **parent rollback** if the child
insert fails: `save-bundle-line/index.ts:187-199`
```ts
if (choicesError) {
  // Roll back the new line so we don't leave an orphaned choice_set
  // line with no options.
  try {
    await serviceClient
      .from("bundle_lines")
      .delete()
      .eq("id", newLine.id);
  } catch (rollbackError) { ... }
  return jsonResponse({ error: choicesError.message }, 400);
}
```
(Delete-and-reinsert is safe against the NOT-NULL-upsert trap of operational learning #23, because
each reinserted row carries all NOT NULL columns.)

**Shape note (structural depth):** `save-bundle-line` writes ONE parent (`bundle_lines`) + its
direct children (`bundle_line_choice_products`) per call — a **two-tier** composite. The option
editor's definition data is **three-tier**: `products` → many `product_option_groups` → each with
many `product_options`. Saving one group + its options per call maps exactly onto this template;
saving all of a product's groups at once would be one tier deeper than any existing function does in
a single call. (Fact, not a recommendation.)

### Q1b — `update-product/index.ts` (read in full) — extend it, or new function?

`update-product` uses the **identical** auth + vendor-scoping + tenancy-belt pattern
(`update-product/index.ts:44-54` auth, `:75-87` vendor ownership, `:89-101` tenancy belt against
`products`), then does a **single-table, flat, whitelisted `.update()` on `products` only**:

`update-product/index.ts:103-120`
```ts
const update: Record<string, unknown> = {};
for (const key of Object.keys(fields)) {
  if (ALLOWED_FIELDS.has(key)) {
    update[key] = fields[key];
  }
}
if (Object.keys(update).length === 0) {
  return jsonResponse({ error: "No valid fields to update" }, 400);
}
const { data, error } = await serviceClient
  .from("products")
  .update(update)
  .eq("id", product_id)
  .eq("vendor_id", vendor.id)
  .select("*")
  .maybeSingle();
```

Its `ALLOWED_FIELDS` is a fixed list of **`products` columns** only (`update-product/index.ts:12-29`)
— `name, description, image_url, category_id, category, price_pence, capacity_units,
counts_toward_capacity, capacity_weight, sort_order, is_active, travels_well,
suitable_for_collection, prep_complexity, allergens, dietary_flags`. It has **no child-table
machinery** — no delete/reinsert, no rollback, no second `.from(...)`.

**Evidence for each direction (no recommendation):**
- *Extend `update-product`:* it already owns the `products` row for this exact vendor+product with
  the correct auth and tenancy belt (`:89-101`); if option groups were treated as more product
  attributes, this is where the product write already lives.
- *New dedicated function:* option groups are **separate tables (parent + children), not `products`
  columns**. `update-product` writes exactly one `products` row via a column whitelist (`:114-120`)
  and contains none of the composite delete-and-reinsert/rollback logic that this needs — that logic
  exists only in `save-bundle-line` (Q1a). The codebase's composite writes (`save-bundle-line`,
  `duplicate-bundle`) are their own functions, separate from the flat single-row updaters
  (`update-product`, `update-category`).

### Q1c — Standard Edge Function auth pattern (confirmed)

`verify_jwt = false` at the gateway + in-function `auth.getUser()` + service-role client is the
standard. Config: `supabase/config.toml:73-74` (`[functions.update-product]` / `verify_jwt = false`)
and `:91-92` (`[functions.save-bundle-line]` / `verify_jwt = false`). In-function verification is the
`anonClient.auth.getUser(authHeader.replace("Bearer ", ""))` block quoted in Q1a
(`save-bundle-line:38-45`), identical in `update-product:47-54`; the actual writes use a separate
service-role client (`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` —
`save-bundle-line:67-70`, `update-product:70-73`). This matches CLAUDE.md operational learnings
#16 and #18.

---

## Q2 — The read path

### Q2a — `v_products_enriched`: extend the view, or a separate per-product fetch?

**`v_products_enriched` has no DDL anywhere in the repo** — no `CREATE ... VIEW v_products_enriched`
exists under `supabase/` or elsewhere (grep clean). It is only *consumed* (`drop-menu.html:1521`) and
*described in prose* (SCHEMA.md, CLAUDE.md). Its true column list and definer/invoker status can only
be read from the live DB.

> **NEEDS-ED-VERIFY** — run in the SQL editor:
> ```sql
> -- Definition + columns of the products read view
> select pg_get_viewdef('public.v_products_enriched', true);
>
> select column_name, data_type
> from information_schema.columns
> where table_schema = 'public' and table_name = 'v_products_enriched'
> order by ordinal_position;
>
> -- Is it a definer or invoker view? (bearing on anon readability)
> select relname, reloptions
> from pg_class
> where relname = 'v_products_enriched';
> ```

**Evidence that the established pattern for one-to-many catalog children is a SEPARATE fetch, not a
folded-in view column:** the bundle read does exactly that. `v_bundles_enriched` is loaded flat
(one row per bundle, `drop-menu.html:1522`), and the one-to-many children are loaded by a *separate*
function `loadBundleChildren()` against their own views:

`drop-menu.html:1547-1578`
```js
async function loadBundleChildren() {
  ...
  const bundleIds = state.bundles.map((b) => b.id);
  const { data: lines, error: linesError } = await supabase
    .from("v_bundle_lines_enriched")
    .select("*")
    .in("bundle_id", bundleIds)
    .order("sort_order", { ascending: true });
  ...
  const lineIds = state.bundleLines.map((l) => l.id);
  ...
  const { data: options, error: optionsError } = await supabase
    .from("v_bundle_line_choice_products_enriched")
    .select("*")
    .in("bundle_line_id", lineIds)
    .order("sort_order", { ascending: true });
```
`v_products_enriched` is a **flat one-row-per-product** view (loaded with `select("*")` +
`.order("sort_order")` + `.order("name")` at `:1521`); option groups/options are one-to-many, which
is the same shape `loadBundleChildren` handles out-of-line rather than folding into the flat parent
view. (Fact: this is the existing precedent; not a recommendation.)

**LOAD-BEARING read-path constraint (the real Stage-2 blocker).** The bundle-child reads above are
**direct PostgREST reads** from the (anon-effective) operator page. The Stage-1 migration **REVOKE'd
the new option tables from `anon` and enabled RLS with no policies**
(`20260704120000_create_product_option_tables.sql`, quoted in Q3a below). So a direct
`supabase.from("product_option_groups")...` read from `drop-menu.html` — copying the
`loadBundleChildren` model against the **raw tables** — would hit the anon role against an RLS-locked,
grant-revoked table and return **zero rows** (the silent-empty failure mode of operational
learnings #52/#53). Therefore the option read path cannot simply mirror `loadBundleChildren` against
the base tables. The two evidence-based ways to make the data anon-readable from the page are: (i)
expose it through a **definer/anon-granted view** (new `v_*` view, or extend `v_products_enriched`
via JSON aggregation), or (ii) read it via a **service-role Edge Function**
(`supabase.functions.invoke`). Whether `v_products_enriched` itself is currently anon-readable is the
NEEDS-ED-VERIFY above. (Establishing the constraint; not choosing between the options.)

### Q2b — How `drop-menu.html` scopes reads of the new tables to the vendor

The new tables have **no `vendor_id` column** (Q3a). The existing analogous scoped read chains
through parent ids, not a vendor column on the child:

- The parent product list IS scoped by a real vendor column: `drop-menu.html:1521`
  ```js
  supabase.from("v_products_enriched").select("*").eq("vendor_id", state.vendorId)...
  ```
- The children are then scoped **transitively by parent id** — `loadBundleChildren` filters
  `.in("bundle_id", bundleIds)` and `.in("bundle_line_id", lineIds)` where those id lists come from
  the already-vendor-scoped `state.bundles` / `state.bundleLines` (`drop-menu.html:1554-1575`, quoted
  in Q2a). There is no `.eq("vendor_id", ...)` on the child reads because the child tables carry no
  such column.

The exact analogue for options: scope `product_option_groups` by `.in("product_id", productIds)`
(productIds from the vendor-scoped `state.products`), then `product_options` by
`.in("group_id", groupIds)` — the scoping chain being
`product_option_groups.product_id → products.vendor_id`. **But** per the Q2a load-bearing constraint,
that `.in(...)` scoping only returns rows if the read goes through an anon-granted view or a
service-role EF, since the raw tables are anon-REVOKE'd.

---

## Q3 — Reconciliation with the Stage-1 tables

### Q3a — Stage-1 column definitions (verbatim, from the migration on main)

`supabase/migrations/20260704120000_create_product_option_tables.sql`:
```sql
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

create table product_options (
  id                uuid        primary key default gen_random_uuid(),
  group_id          uuid        not null references product_option_groups(id) on delete cascade,
  name              text        not null,
  price_delta_pence integer     not null default 0,
  sort_order        integer     not null default 0,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);

create table order_option_selections (
  id                        uuid        primary key default gen_random_uuid(),
  order_item_id             uuid        not null references order_items(id) on delete cascade,
  option_id                 uuid        not null references product_options(id),
  group_id                  uuid        not null references product_option_groups(id),
  option_name_snapshot      text        not null,
  price_delta_pence_snapshot integer    not null,
  created_at                timestamptz not null default now()
);
```
Plus RLS + revoke (lines quoted for the read constraint):
```sql
alter table product_option_groups   enable row level security;
-- ...product_options, order_option_selections likewise...
revoke all on product_option_groups   from anon, authenticated;
revoke all on product_options         from anon, authenticated;
revoke all on order_option_selections from anon, authenticated;
```

### Q3b — Confirmed inert (nothing reads or writes these tables)

Repo-wide grep for `product_option_groups` / `product_options` / `order_option_selections` returns
matches **only** in (a) the Stage-1 migration and (b) SCHEMA.md documentation
(`SCHEMA.md:218,229,230,338,341,342`). **No `.from("product_option*")`, no
`.from("order_option_selections")`, no Edge Function, no view, no page reads or writes them.** Inert
as designed.

---

## SUMMARY (plain English)

**(a) Extend `update-product` or a new function — the evidence.**
`update-product` is a **flat single-`products`-row updater**: a fixed whitelist of `products`
columns (`update-product:12-29`) and one `.update().eq("id").eq("vendor_id")` (`:114-120`), with no
child-table logic. Option groups are **separate parent+child tables**, and the only composite
write pattern in the codebase (parent row + delete-and-reinsert children + rollback) lives in
`save-bundle-line` (`:139-156`, `:187-199`), which is its own function separate from the flat
updaters. Both functions already share the identical auth + vendor-ownership + tenancy-belt block, so
either could host the vendor check; the deciding evidence is that the *write shape* option-saving
needs exists only in `save-bundle-line`, not in `update-product`.

**(b) Extend the view or a separate fetch — the evidence.**
Two facts. (1) The existing precedent for one-to-many catalog children is a **separate out-of-line
fetch**: `loadBundleChildren` (`drop-menu.html:1547-1578`) loads bundle lines/choice-products from
their own views by `.in(parent_id, ...)`, rather than folding them into the flat
`v_bundles_enriched`; `v_products_enriched` is likewise a flat one-row-per-product view (`:1521`).
(2) **However**, the Stage-1 tables are anon-REVOKE'd + RLS-no-policy (Q3a), so — unlike the bundle
child views — a *direct* page read of the raw option tables returns zero rows under the anon-effective
operator client (learnings #52/#53). So the read must go through **either an anon-granted view (new
`v_*`, or `v_products_enriched` extended via JSON aggregation) or a service-role Edge Function** — the
plain direct-table copy of `loadBundleChildren` will silently return nothing. `v_products_enriched`'s
own definition/anon-readability is **NEEDS-ED-VERIFY** (pg_get_viewdef SQL in Q2a).

**(c) The exact write shape option-save should follow (modelled on `save-bundle-line`).**
1. Require `Authorization` header; `anonClient.auth.getUser(token)` → 401 if absent/invalid
   (`save-bundle-line:34-45`).
2. Service-role lookup `vendors` by `id = vendor_id AND auth_user_id = user.id` → 403 if not owned
   (`:72-84`).
3. Tenancy belt: service-role fetch the parent `products` row, assert `product.vendor_id === vendor.id`
   → 403 otherwise (model of `:86-97`, against `products` as `update-product:89-101` already does).
4. Whitelist group fields; **server sets `product_id`** on the group row, never trusts the body's
   parent id for the payload (`:99-107`).
5. Reconcile the child `product_options` by **DELETE-AND-REINSERT** keyed on `group_id`
   (`:139-156`), with parent-row **rollback** if a child insert fails on the create path
   (`:187-199`). Delete-and-reinsert avoids the NOT-NULL-upsert trap (learning #23) since each
   reinserted option carries `name` + `price_delta_pence`.
6. `verify_jwt = false` in `config.toml` for the new function (Q1c).
   Structural caveat: the definition data is three-tier (`products` → groups → options); one call
   should save one group + its options to stay a two-tier composite like `save-bundle-line`.

**(d) Mismatch between the Stage-1 tables and what the editor needs.**
No *column* mismatch — `product_option_groups` (name/min_select/max_select/is_required/sort_order/
is_active) and `product_options` (name/price_delta_pence/sort_order/is_active) carry exactly the
fields the editor defines (Q3a). The only reconciliation gap is **access posture, not shape**: the
tables are service-role-only (anon REVOKE + RLS-no-policy), so the write MUST go through an Edge
Function (fine — that's the plan) and the read MUST go through an anon-granted view or an EF, **not** a
direct page read of the raw tables. `order_option_selections` is not part of the editor's paths at all
— it is the checkout-time write owned by create-order in a later stage.

---

## Spillover (one line each — noted, not chased)
- `v_products_enriched`, `v_bundles_enriched`, `v_bundle_lines_enriched`, `v_bundle_line_choice_products_enriched` have **no DDL committed in the repo** — view truth lives only in the live DB (broader than this audit; relevant to any future view work).
- `applySavedRowToState` (`drop-menu.html:1587-1595`) patches the EF-returned row over the view-loaded row to dodge enriched-view lag — a Stage-2 option save that returns its rows could reuse this to avoid a full reload.
- create-order (`order_option_selections` writer) and the customer order page are the Stage-3 surface — not audited here; the price-delta must be re-derived server-side there per #427 (the prior product-options audit's summary point d).
