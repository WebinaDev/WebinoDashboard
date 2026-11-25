# Port to `main` — the branch the platform actually builds

The platform build syncs `main`:

```
Syncing https://github.com/Webinadev/WebinoDashboard.git (main) → /var/lib/webino/src/WebinoDashboard
```

`main` and the Arena branches have **unrelated git histories** —
`git merge-base origin/main arena/8a3cfd3b-webinodashboard` returns nothing, and 308 files
differ. `main` was force-updated to `eab7793` ("."), replacing the previous tip (`13eaae1`,
itself a merge of Arena PR #30). Merging this branch into `main` would therefore discard
`main`'s own work, which is ahead in several places (58 routes including treasury,
cheque-books, expenses, fixed assets, supplier bills). So the changes travel as one patch
that was merged onto `main`'s actual file versions by hand.

## Apply

From the root of a `main` checkout:

```bash
git apply patches/main-accounting-port.patch
```

26 files, 1547 lines. Applies to `eab7793` with no fuzz.

## What was broken

Twelve separate defects. Each one was confirmed by reading the code path that fails, not
inferred.

**Build**

1. `extra-widgets.tsx:651` declared `[RefObject<T>, boolean]` while `useRef<T>(null)` yields
   `RefObject<T | null>` under React 19 types. The only TypeScript error on `main`, and the
   direct cause of `platform.dashboard_rebuild_failed`.

**Why the module was unreachable**

2. ERP routes were gated on `module:accounting`, which `ModuleAliasMap` resolves to
   `commerce.accounting` — the till ledger, a different switch that ships disabled. Every
   `/api/v1/erp-accounting` call answered 403. Now gated on a real `erp-accounting` alias,
   with a module-level fallback in `EnsureModuleEnabled`.
3. Frontend manifest slug was `erp-accounting`, but `loadAdminPage` imports
   `modules/${moduleSlug}/admin/{page}-page` and the folder is `modules/accounting`. Every
   ERP page failed to load. Slug now matches; the API prefix stays `erp-accounting`.
4. Only `cafe`/`coffee`/`ecommerce` carried accounting. Now all seven site types
   (`SiteTypeProfiles::accountingModules()`, `manifest.json`, `manifest.ts`), plus a backfill
   migration for existing tenants.

**Why the screens were empty even once reachable**

5. Nothing seeded a chart of accounts or a fiscal year on first run. New
   `AccountingProvisioningService` (idempotent, explicit `tenant_id`) runs from
   `applySiteType()` and from `ModuleController::update()`.
6. `seed_chart` created five English-named roots with no postable accounts. Confirming an
   invoice posts to 113 (receivables) and 401 (sales) and answered 422 without them. Now
   delegates to the full Iranian chart seeder.
7. `seedChartIran` refused production with 403, so a live shop could not seed at all.
8. Chart `code` uniqueness was `unique:acc_chart_accounts,code` — global, so one shop's code
   1101 rejected the same code for every other shop. Now tenant-scoped.
9. Balance sheet filtered `liabilities_equity` on `liabilit`/`payable` only, dropping the
   `equity` accounts (chart code 3). Assets never equalled liabilities + equity.
10. `AccReports` passed the whole report object to the tables as the row array. The API
    answers `{ type, rows, totals }`, so `Array.isArray` was false and every trial balance
    and P&L rendered its empty state. (The balance sheet read `data.assets` and was fine.)
11. `AccFiscalYear` read `start_date`/`end_date`/`is_active` while the entity exposes
    `starts_on`/`ends_on`/`is_closed` — three blank columns and a status badge stuck on
    "inactive". Also read-only, though `fiscal_year_save`/`fiscal_year_delete` already
    existed server-side. Now has create/edit/delete and accepts both spellings.
12. `api-client` unwrapped `data` and discarded envelope `meta`, so `last_page` never reached
    the list pages and each rendered a single page. Now preserved via `unwrapApiResponse`.

Deliberately **not** touched: `main`'s `Routes/api.php` and its controllers, which are ahead
of this branch. Nothing here is dead code — the frontend's 25 endpoints, 21 wp-actions and
7 warehouse-ajax actions all already resolve.

## Verification

Run on a checkout of `main` (`eab7793`) with `main`'s own `package-lock.json`:

| check | pristine `main` | `main` + patch |
|---|---|---|
| `npm run build` (the failing Docker step) | — | **exit 0**, compiled 31.1s, 12 static pages |
| `npx tsc --noEmit` | exit 2 — `TS2322` | **exit 0** |
| `npm run check:i18n` | — | **OK** |
| `npm run check:links` | — | **OK (413 links)** |
| `npm run test:nav` | — | **OK** |
| route → controller::method (58 routes) | — | **54/54 resolve** |
| frontend endpoint → route (25) | — | **0 missing** |
| frontend wp-action → service (21) | — | **0 missing** |
| frontend warehouse-ajax → controller (7) | — | **0 missing** |
| tables/columns written by provisioning | — | **all present in schema** |
| brace/paren balance, 13 changed PHP files | — | **balanced** |

`npm run check:english` exits 1 both with and without the patch (24 pre-existing hardcoded
strings, none in accounting; the patched files add none).

## Not verified here

`php -l` and the backend suite (`backend/tests/Feature/ErpAccountingAllSiteTypesTest.php`)
could not run: no PHP interpreter, no Docker, and no root for `apt-get install php-cli` in
the sandbox. The PHP changes rest on the static checks above — schema and route targets
were checked against the migrations and controllers, but no PHP was executed.

After applying, run on the server:

```bash
php artisan migrate          # backfills accounting activations for existing tenants
```
