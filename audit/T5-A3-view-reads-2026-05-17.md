# T5-A3 Priority 1 — frontend v_* view read map (2026-05-17)

This is a **read-only** investigation. No HTML, JS, config, or database
object was changed by this audit. It pairs with the separate SQL
dependency + column extraction Ed is running against the database
(view definitions, `security_invoker` status, base-table dependency
graph) — together those two outputs form the full picture needed to
decide remediation. **No remediation is implied by this file.**

Auth-context tags (`operator` / `customer-public` / `post-auth` /
`dev-tool`) are **inherited verbatim** from
`audit/T5-A3-reads-audit-2026-05-17.md` Section B so the two audits
stay consistent. This file does not re-derive auth context. If a
read appeared in the grep below but is not classified in the reads
audit, it is tagged `auth UNKNOWN — needs confirmation` — none
were found.

Source grep:

```
grep -rnE "\.from\(['\"]v_[a-zA-Z0-9_]+" \
  --include="*.html" --include="*.js" \
  --exclude-dir=.git --exclude-dir=node_modules .
```

- Total frontend `v_*` view reads found: **37**
- Distinct views read by the frontend: **19**

---

## By-view map

### v_drop_summary

Auth flag: **BOTH** (operator + customer-public anon)

| File | Line | Auth context |
| ---- | ---- | ------------ |
| host-profile.html | 1057 | operator |
| drop-manager.html | 2781 | operator |
| drop-manager.html | 3057 | operator |
| service-board.html | 1713 | operator |
| service-board.html | 1824 | operator |
| scorecard.html | 665 | operator |
| hosts.html | 558 | operator |
| host-view.html | 413 | customer-public |
| host-view.html | 444 | customer-public |
| order.html | 2377 | customer-public |
| order.html | 3738 | customer-public |
| order.html | 4050 | customer-public |

### v_hearth_summary

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| home.html | 1216 | operator |

### v_hearth_drop_stats

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| home.html | 1217 | operator |
| insights.html | 1083 | operator |
| customers.html | 830 | operator |

### v_hearth_revenue_over_time

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| insights.html | 1084 | operator |

### v_item_sales

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| home.html | 1220 | operator |
| insights.html | 1085 | operator |
| scorecard.html | 685 | operator |
| customers.html | 831 | operator |

### v_host_performance

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| home.html | 1221 | operator |
| insights.html | 1086 | operator |
| customers.html | 832 | operator |

### v_drop_readiness_v2

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-manager.html | 3058 | operator |

### v_drop_menu_item_stock

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-manager.html | 3060 | operator |

### v_drop_orders_summary

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| service-board.html | 1825 | operator |

### v_order_item_detail

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| service-board.html | 1804 | operator |

### v_order_item_detail_v2

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| service-board.html | 1792 | operator |

### v_order_item_detail_expanded

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| service-board.html | 1780 | operator |

### v_products_enriched

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1521 | operator |

### v_bundles_enriched

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1522 | operator |

### v_menu_library_items

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1523 | operator |

### v_product_analytics

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1524 | operator |

### v_bundle_analytics

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1525 | operator |

### v_bundle_lines_enriched

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1557 | operator |

### v_bundle_line_choice_products_enriched

Auth flag: **AUTHENTICATED only**

| File | Line | Auth context |
| ---- | ---- | ------------ |
| drop-menu.html | 1572 | operator |

---

## Auth-flag summary

| Flag | Count of views |
| ---- | -------------- |
| Read by ANON only | 0 |
| Read by AUTHENTICATED only | 18 |
| Read by BOTH | 1 |
| Auth UNKNOWN | 0 |

---

## Views read by anon (handle with care)

These are the views that anonymous (`customer-public`) callers reach
today. They are the views most likely to break under `security_invoker`
once base-table policies tighten, and they are the views that need the
most careful column-by-column inspection against the
`v_vendor_public` / `v_host_public` shape decisions tracked elsewhere.

- **v_drop_summary** — 5 anon read sites (`host-view.html:413`,
  `host-view.html:444`, `order.html:2377`, `order.html:3738`,
  `order.html:4050`) and 7 operator read sites. The only view in the
  frontend currently spanning both auth contexts.

No other view is reached by an anon caller in the frontend grep.
