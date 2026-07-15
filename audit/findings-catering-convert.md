# Findings — "Turn this enquiry into a catering drop" bridge (read-only audit)

Date: 2026-07-05 · Read-only · No edits, no commit. Verdict on injection feasibility: **(b) — Drop Studio has no seed/param intake; a new intake path is needed.**

## TL;DR
- Drop Studio is `drop-manager.html`. It initialises against a **real DB drop row**, selected by id. It only ever (i) starts a blank draft via `createNewDrop()` — hardcoded `drop_type: "neighbourhood"` — or (ii) loads an existing drop by id via the `get-drop` EF and seeds the form from that DB row in `populateForm()`. There is **no** `?drop=`/`?edit=`/seed-object intake.
- There is **no `drop_type='catering'` and no `catering_mode`.** "Catering" ships as an **`event`** drop (T3-13b): `drop_type="event"` + `expected_guests` + `discount_tiers`, with capacity enforcement skipped server-side.
- Minimum to create a valid drop via `create-drop`: `vendor_id` + `fields.{name, slug}`. Everything else has DB defaults.
- A single-enquiry read is **not** available today — `list-catering-enquiries` is a list-only, status='open'-scoped read with no id param. The bridge needs either a tiny new `get-catering-enquiry` EF or to reuse the list and `.find(id)` client-side (works only while the enquiry is still `open`).

---

## 1. Drop Studio entry + init

**File:** `drop-manager.html` (confirmed — the only Drop Studio page; `catering` does not even appear in it).

**Init:** `init()` at `drop-manager.html:6405`. It wires events, pre-populates time dropdowns, renders conditional fields, then `loadVendorId()` → `loadVendorCustomerCount()` → `refreshAll()`. It does **not** read any drop-identifying URL param.

**URL params read anywhere on the page** — only three, all via `getUrlParam()` (`drop-manager.html:2676`):
- `vendor` / `vendor_slug` (`:2687`, `:2694`) — vendor resolution/storage scoping
- `host_context` (`:2703`) — `state.inboundHostContext`

`grep` for `?drop=` / `?edit=` / `prefill` / `seed` / `enquiry` in drop-manager returns only outbound links to **other** pages (order.html `:2148`, scorecard.html `:3372`, host-view.html `:6334`) — never an inbound read.

**How an existing drop gets edited (load-by-id path):**
- `state.selectedDropId` is set only from: the clicked drop card `card.dataset.dropId` (`:6290`), the first drop in the list as default (`:2786`), `createNewDrop`/window-create (`:4831`, `:4904`, `:4995`), or cleared when stale (`:3051`, `:3070`). It is also restored from `localStorage` (`vendorScopedStorageKey("selectedDropId")`, `:5540`). **Never from a URL param.**
- `loadSelectedDropData()` fetches the row via `supabase.functions.invoke("get-drop", { body: { drop_id: state.selectedDropId } })` (`:3030`).
- `populateForm()` (`:3571`) seeds every input **exclusively from `state.drop`** (the DB row): `const d = state.drop; if (!d) return;` then `byId("dropName").value = d.name`, etc. There is no branch that reads incoming/param/seed data.

**Blank-draft path:** `createNewDrop()` (`:4790`) builds a hardcoded payload (`name: "New Drop"`, `drop_type: "neighbourhood"`, default timing a week out, `capacity_units_total: 40`), inserts via `create-drop`, sets `selectedDropId = data.id`, and `refreshAll()` reloads it. No parameterisation.

> **Answer to the key question:** There is **no** code path that seeds the form from incoming data. The form is seeded only from a DB row loaded by id, or started blank with hardcoded defaults.

## 2. The catering create path (T3-13 / T3-13b)

There is **no dedicated catering type or mode.** Catering = an **event** drop:
- Drop-type control `#dropType` offers exactly three values: `neighbourhood`, `community` (labelled "Hosted"), `event` (`drop-manager.html:1238–1242`).
- `VALID_DROP_TYPES = {neighbourhood, community, event}` in both `create-drop/index.ts:49` and update-drop.
- Event-specific behaviour: `isEvent = dropType === "event"` gates the **Expected guests** section (`#expectedGuestsSection` shown when event, `:3930–3934`) and the **discount tiers** editor; capacity is forced to `by_order`/empty and **skipped** (`getLiveDropFromForm`, `:4360–4380`; readiness `capacityValid = drop_type === "event" ? true : …`, `:2468`). `create-order` skips capacity reservation for events (per CLAUDE.md T3-13b).

**Edge Functions the create/save goes through (real names):**
- Create: `create-drop` (invoked by `createNewDrop`, `:4824`). Minimal insert.
- Save/edit: `update-drop` (the rich field set from `getLiveDropFromForm()` → `getDropPayload()` is sent on save; `:4675`, `:4762`). `assign-menu-items` handles menu assignment (`:4551`).

**Minimum fields to create a valid drop** (`create-drop/index.ts`): top-level `vendor_id` (`:86`) + a `fields` object (`:88`) whose only hard requirements are **`name`** and **`slug`** (`:126–127`). `drop_type` if present must be in `VALID_DROP_TYPES` (`:130`), else DB default applies (null values are stripped so DB defaults win, `:117–121`). `fulfilment_mode`/`audience_scope` validated only if present. So a **minimal catering draft** = `vendor_id` + `{ name, slug, drop_type: "event" }`; a **publishable** one additionally needs `delivery_start`/`delivery_end`, `closes_at`, and `fulfilment_mode` (publish gate `getLiveReadiness()` `:2457`, server gate `transition-drop-status`).

> Note: `create-drop`'s `ALLOWED_FIELDS` (`:18–47`) does **not** include `notes_internal`, `collection_point_description`, `delivery_area_description`, `customer_notes_enabled`, `delivery_area_type`, `allowed_postcode_prefixes`. Those persist via the subsequent **`update-drop`** save, not at creation. Any bridge that pre-fills those must route them through the existing save (update-drop) step, mirroring today's create-then-edit lifecycle.

## 3. Field inventory for mapping (enquiry → drop)

`catering_enquiries` columns (from `submit-catering-enquiry/index.ts:208–218` insert + `list-catering-enquiries` select): `id, vendor_id, contact_name, contact_email, contact_phone, event_date` (date), `guest_count` (int), `event_type` (free text), `fulfilment` (`'collection'|'delivery'` only, `:129`), `brief` (text), `status` (default `'open'`), `source`, `created_at`.

Plausible pre-fill mapping to Drop Studio fields:

| Enquiry field | Drop target (form id / column) | Notes |
|---|---|---|
| `event_date` (date) | `#deliveryDate` → `delivery_start` / `delivery_end` (columns) | Date only; Drop Studio combines date + `#deliveryStartTime`/`#deliveryEndTime`. A time must be chosen/defaulted. |
| `guest_count` (int) | `#expectedGuests` → `expected_guests` | Direct; only meaningful when `drop_type="event"` (section hidden otherwise). |
| `fulfilment` (`collection`/`delivery`) | `#fulfilmentMode` → `fulfilment_mode` | Direct subset map — drop allows `collection`/`delivery`/`mixed` (`create-drop:51`); the two enquiry values map 1:1. |
| `event_type` (free text) | no direct column | Could seed the drop **name** and/or `notes_internal`. No dedicated field. |
| `contact_name` | no direct column | Best into `notes_internal` (`#notesInternal` → `notes_internal`) and/or composed into the drop **name**, e.g. "Catering — {contact_name}, {event_date}". Drops have no customer-contact fields. |
| `contact_email` / `contact_phone` | no direct column | Only home for these is `notes_internal` (drops store no customer contact). |
| `brief` (text) | no direct column | → `notes_internal` (internal) — **not** `drop_intro` (that is customer-facing). |
| — (name is required) | `#dropName` → `name` (**required**) | Enquiries have no title; the bridge must **compose** a name (required by create-drop). |
| — | `#dropSlug` → `slug` (**required**) | Must be generated (`buildUniqueSlug`), as `createNewDrop` does. |
| — | `drop_type` = `"event"` | Set explicitly so the guest/discount/capacity-skip behaviour engages. |

Direct-mappable today: `event_date → delivery_*`, `guest_count → expected_guests`, `fulfilment → fulfilment_mode`. Everything else (name, contact, brief, event_type) has **no dedicated drop column** and would land in `name`/`notes_internal` or be dropped.

## 4. Injection feasibility — verdict

**(b) is true, unambiguously.** Drop Studio only ever **starts blank** (`createNewDrop()`, hardcoded `neighbourhood`, `:4790`) or **loads an existing drop by id from the DB** (`loadSelectedDropData` → `get-drop`, `:3030`; `populateForm` seeds from `state.drop`, `:3571`). `selectedDropId` is never set from a URL param, and no seed-object intake exists. Evidence: the only params read are `vendor`/`vendor_slug`/`host_context` (`:2687–2703`); `populateForm` guards on `state.drop` and reads only DB columns.

**Implication for the bridge:** seeding from an enquiry needs a **new intake path** added to shipped drop-creation code. The cleanest fit follows the existing two-step lifecycle: create a draft server-side (extend/parameterise `createNewDrop` to accept enquiry-derived `name`/`slug`/`drop_type:"event"`/`event_date`→timing/`guest_count`→`expected_guests`/`fulfilment`→`fulfilment_mode`, sent to `create-drop`), then load it and let the operator finish + save via the existing `update-drop` path. Optionally set `state.currentStage`/scroll as `createNewDrop` already does. No change to `populateForm` is required if the seed values are written to the DB row first (they then flow in through the normal `get-drop` load) — this reuses the shipped seeding mechanism rather than inventing a client-side pre-fill.

## 5. Enquiry read for the bridge

`list-catering-enquiries` (`supabase/functions/list-catering-enquiries/index.ts`) is **list-only**: JWT → resolve vendor from `vendors.auth_user_id` → service-role read of `catering_enquiries` **`WHERE vendor_id = … AND status = 'open'`**, ordered by `created_at` desc. **No `id` parameter, no single-row path.** Only two catering EFs exist (`submit-catering-enquiry`, `list-catering-enquiries`) — no `get-catering-enquiry`.

Two options for the bridge's single-enquiry read:
- **Reuse the list** and `.find(e => e.id === id)` client-side. Zero EF change, but only works while the enquiry is still `status='open'`; if conversion flips it to closed/converted it drops out of the list. Also returns the 10-column projection only.
- **Add a tiny `get-catering-enquiry` EF** (mirror `list-catering-enquiries`' auth/vendor-scope, select by `id` + `vendor_id`, any status). Cleaner and status-independent — recommended if conversion changes the enquiry's status.

The list projection already exposes every column the mapping in §3 needs (`id, contact_name, contact_email, contact_phone, event_date, guest_count, event_type, fulfilment, brief, created_at`), so a new EF would add no fields — only a by-id, status-agnostic access shape.

---

### Out of scope but noted (not chased)
- `submit-catering-enquiry` enforces `fulfilment ∈ {collection, delivery}` (`:129`) — narrower than the drop's `{collection, delivery, mixed}`; fine for a 1:1 map.
- Conversion presumably should flip `catering_enquiries.status` from `open` (so it leaves the Home list). No status-transition EF for enquiries exists yet — a convert flow will likely need one (or fold the flip into the bridge's create step). Flagged only; belongs to the build session.
