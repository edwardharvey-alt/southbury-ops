# Hearth — Claude Code Project Guide

## What Hearth is

Hearth is a vendor-first, community-powered food ordering platform built around
planned "drops" — not always-on ordering. Every drop has a fixed time window,
a designed menu, declared capacity, and a host context. This is not a
marketplace. It is not an aggregator. It is infrastructure for shared local
food moments.

Core belief: great local food should strengthen communities, not bypass them.

## The model — non-negotiables

- Drops are always: time-bound, capacity-limited, pre-order only
- Vendors control when and how they operate
- Community hosts benefit visibly and meaningfully
- No marketplace language, no fake urgency, no aggregator patterns
- Capacity is always real and respected — never manipulated

## Tech stack

- Static HTML / CSS / JS — no framework
- Supabase (Postgres) with Supabase JS v2 — direct DB queries from frontend
- Netlify hosting — auto-deploys from main branch
- GitHub repo: github.com/edwardharvey-alt/southbury-ops
- Shared stylesheet: assets/hearth.css
- Config: assets/config.js — exports window.HEARTH_CONFIG.SUPABASE_URL
  and window.HEARTH_CONFIG.SUPABASE_ANON_KEY

## File structure

- index.html — Service Board (live operational view for active drops)
- drop-manager.html — Drop Studio (create and configure drops)
- drop-menu.html — Menu Library (products, bundles, categories)
- brand-hearth.html — Brand Hearth (vendor identity editor)
- insights.html — Insights (analytics dashboard)
- home.html — Platform home dashboard
- order.html — Customer-facing ordering page
- order-entry.html — Dev tool for test order entry (legacy, needs rebuild)
- assets/hearth.css — shared platform stylesheet
- assets/config.js — Supabase config
- assets/vendors/southbury-farm-pizza/ — vendor image assets

## Database — key tables

- vendors — vendor identity and brand settings
- drops — the core unit: each drop has slug, timing, capacity, host, status
- drop_menu_items — items enabled for a specific drop (product or bundle)
- products — catalogue products (vendor-scoped)
- bundles — catalogue bundles with bundle_lines and bundle_line_choice_products
- categories — product/bundle groupings (vendor-scoped)
- orders — customer orders (drop_id, customer details, status, pizzas field)
- order_items — line items (item_type: product|bundle, qty, price_pence,
  capacity_units_snapshot)
- order_item_selections — bundle choice selections per order item
- order_status_events — audit trail of status transitions
- hosts — community hosts (clubs, schools, venues)
- drop_series / drop_series_schedule — recurring drop infrastructure

## Database — key views

- v_drop_summary — primary drop view used across all operator pages
- v_drop_orders_summary — order list for Service Board
- v_order_item_detail_expanded — expanded item detail for Service Board
- v_drop_menu_item_stock — menu items with capacity and stock tracking
- v_drop_readiness_v2 — drop readiness checklist
- v_hearth_summary — 30-day business summary for home/insights
- v_hearth_drop_stats — per-drop analytics
- v_hearth_revenue_over_time — revenue time series
- v_item_sales — item-level sales analytics
- v_host_performance — host-level analytics

## Critical rules for all code changes

1. NEVER hardcode vendor slugs, vendor IDs, or capacity category names.
   All vendor resolution must use resolveVendor() pattern:
   URL param → window.HEARTH_VENDOR_ID → first vendor fallback.

2. NEVER use pizza-specific language or assumptions. Capacity drivers are
   vendor-agnostic. The capacity category is defined per drop.

3. ALWAYS use window.HEARTH_CONFIG.SUPABASE_URL and
   window.HEARTH_CONFIG.SUPABASE_ANON_KEY for Supabase initialisation.
   Never use window.HEARTH_SUPABASE_URL or window.HEARTH_SUPABASE_KEY.

4. NEVER patch — always understand the full context before making changes.

5. ALWAYS produce complete, untruncated, copy-paste ready code.

6. Branch naming: fix/description for fixes, feature/description for new
   features, enhance/description for improvements.

7. One logical change per branch. Never bundle unrelated changes.

8. orders.pizzas is a legacy NOT NULL field with a >= 1 constraint.
   When inserting orders, populate pizzas with the capacity units consumed
   (minimum 1) until this field is formally migrated away.

## Brand and tone

- Calm, assured, warm, considered, local
- Never: marketplace language, fake urgency, discount/promotion framing,
  algorithmic language
- Vocabulary: Drop, Capacity, Host, Planned moment, Service Board,
  Drop Studio, Menu Library, Brand Hearth, Insights
- Avoid: Campaign, Listing, Inventory, SKU, Funnel, Promotion, Deal

## Current build priorities

1. Order persistence — order.html must write to orders + order_items +
   order_item_selections before Stripe handoff
2. Realtime on Service Board — subscribe to orders table for live updates
3. Vendor slug decoupling — replace hardcoded DEFAULT_VENDOR_SLUG in
   drop-manager.html, drop-menu.html, brand-hearth.html
4. Home and Insights completion
5. Navigation consistency across all pages
