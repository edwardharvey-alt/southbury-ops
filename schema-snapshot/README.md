# schema-snapshot/

Live-DB ground-truth exports of the Hearth Postgres schema (Supabase
project `tvqhhjvumgumyetvpgid`, `public` schema).

**These files are the source of truth.** `../SCHEMA.md` is *rendered
from* them — its generated structural section is a human-readable
projection of `columns-constraints-indexes.json` and `views.json`, and
must never be hand-edited below its fence line. When the schema changes
meaningfully: re-run the two queries below, replace the JSON files with
the fresh result sets verbatim, update the capture date here, then
regenerate the structural half of `../SCHEMA.md` from them.

The base tables of this database were largely created out-of-band in the
Supabase SQL editor and are **not** reconstructable from
`supabase/migrations/` (see ticket `T-base-ddl-backfill`). Until that
backfill lands, these dumps are the only complete structural record of
the live schema, and this directory is the authority for any
select-narrowing / column-existence question (operational learning #54).

## Files

- `columns-constraints-indexes.json` — every base table's full column
  inventory (ordinal, name, type, udt, nullability, default, FK target),
  plus every PRIMARY KEY / UNIQUE / FOREIGN KEY / CHECK constraint
  (with `ON DELETE` behaviour and full CHECK definition), plus every
  index (with full `CREATE INDEX` text). Tagged by a `section` field:
  `A_column`, `B_constraint`, `C_index`.
- `views.json` — every `public` view with its full `pg_get_viewdef`
  definition.

## Date captured

**2026-06-30.**

## How to refresh

### 1. `columns-constraints-indexes.json`

Run in the Supabase SQL Editor; export the result as JSON.

```sql
-- Section A: full column inventory for all public base tables.
SELECT
  'A_column'                              AS section,
  c.table_name,
  c.ordinal_position::text                AS ord,
  c.column_name                           AS name,
  c.data_type
    || COALESCE('(' || c.character_maximum_length || ')', '')
                                          AS type,
  c.udt_name                              AS udt,
  c.is_nullable                           AS nullable,
  c.column_default                        AS default_expr,
  fk.foreign_table_name
    || '.' || fk.foreign_column_name      AS references
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name   = c.table_name
 AND t.table_type   = 'BASE TABLE'
LEFT JOIN (
  SELECT kcu.table_name, kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema    = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema    = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema    = 'public'
) fk ON fk.table_name = c.table_name AND fk.column_name = c.column_name
WHERE c.table_schema = 'public'

UNION ALL

-- Section B: every constraint (PK / UNIQUE / FK / CHECK) by definition.
SELECT
  'B_constraint'                          AS section,
  rel.relname                             AS table_name,
  NULL                                    AS ord,
  con.conname                             AS name,
  CASE con.contype WHEN 'p' THEN 'PRIMARY KEY'
                   WHEN 'u' THEN 'UNIQUE'
                   WHEN 'f' THEN 'FOREIGN KEY'
                   WHEN 'c' THEN 'CHECK'
                   ELSE con.contype::text END AS type,
  NULL                                    AS udt,
  NULL                                    AS nullable,
  pg_get_constraintdef(con.oid)           AS default_expr,
  NULL                                    AS references
FROM pg_constraint con
JOIN pg_class     rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'

UNION ALL

-- Section C: every index (incl. partial indexes).
SELECT
  'C_index'                               AS section,
  tablename                               AS table_name,
  NULL                                    AS ord,
  indexname                               AS name,
  'INDEX'                                 AS type,
  NULL                                    AS udt,
  NULL                                    AS nullable,
  indexdef                                AS default_expr,
  NULL                                    AS references
FROM pg_indexes
WHERE schemaname = 'public'

ORDER BY section, table_name, ord::int NULLS LAST, name;
```

### 2. `views.json`

```sql
SELECT viewname AS view_name,
       pg_get_viewdef(viewname::regclass, true) AS definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;
```

## Companion queries (not committed as artefacts, run on demand)

RLS policies — not captured here; run when auditing the auth boundary:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Triggers:

```sql
SELECT event_object_table, trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```
