# Port to `main` — the branch the platform actually builds

The platform build syncs `main`:

```
Syncing https://github.com/Webinadev/WebinoDashboard.git (main) → /var/lib/webino/src/WebinoDashboard
```

`main` and the Arena branches have **unrelated git histories** —
`git merge-base origin/main arena/8a3cfd3b-webinodashboard` returns nothing, and 308 files
differ. `main` was force-updated to `eab7793` ("."), replacing the previous tip
(`13eaae1`, itself a merge of Arena PR #30). So this branch cannot be merged into `main`
without discarding `main`'s own work; the changes have to travel as a patch.

## Apply

From the root of a `main` checkout:

```bash
git apply patches/main-accounting-port.patch
```

## What it contains (19 files)

**The build blocker** — `frontend/src/builder/render/extra-widgets.tsx:651` declared
`[RefObject<T>, boolean]` while `useRef<T>(null)` yields `RefObject<T | null>` under React 19
types. This was the only TypeScript error on `main` and it is what produced
`platform.dashboard_rebuild_failed`.

**Why accounting did not load on any site type**

| fix | file |
|---|---|
| ERP routes were gated on `module:accounting`, which resolves to the commerce till ledger (`commerce.accounting`) — every `/api/v1/erp-accounting` call answered 403 | `AccountingServiceProvider.php`, `ModuleAliasMap.php`, `EnsureModuleEnabled.php` |
| Frontend slug `erp-accounting` had no matching folder, so `loadAdminPage` imported `modules/erp-accounting/admin/…`, which does not exist | `frontend/modules/accounting/manifest.ts` |
| Only `cafe`/`coffee`/`ecommerce` carried accounting | `SiteTypeProfiles.php`, `manifest.json`, `manifest.ts` |
| No chart of accounts or fiscal year on first run | `AccountingProvisioningService.php`, `AccChartIranSeeder.php`, `TenantActivationService.php`, `ModuleController.php`, new migration |
| Commerce and the ledger both claim `accounting/*` | `registry.ts`, `route-resolver.ts` |
| Pagination meta dropped | `list-utils.ts` |
| Personal preset hid the nav | `business-presets/index.ts` |
| Missing `nav.section_accounting` | `messages/fa.json`, `messages/en.json` |

`main`'s own routes file (`Routes/api.php`, 55 routes incl. treasury, cheque-books,
expenses, fixed assets, supplier bills) is deliberately **not** touched — it is ahead of
this branch. Nothing here replaces `main`'s controllers either.

## Verification

Run on a checkout of `main` (`eab7793`) with `main`'s own `package-lock.json`:

| check | pristine `main` | `main` + patch |
|---|---|---|
| `npx tsc --noEmit` | exit 2 — `extra-widgets.tsx(667,11) error TS2322` | **exit 0** |
| `npm run build` (the failing Docker step) | — | **exit 0**, compiled in 32.5s, 12 static pages |
| `npm run check:i18n` | — | **OK** |
| `npm run check:links` | — | **OK (413 links)** |
| `npm run test:nav` | — | **OK** |
| route → controller::method resolution (55 routes) | — | **54/54 resolve** |
| brace/paren balance, changed PHP | — | **balanced** |

`npm run check:english` exits 1 both with and without the patch (24 pre-existing
hardcoded strings, none in accounting) — not caused by this change.

## Not verified here

`php -l` and the backend test suite (`backend/tests/Feature/ErpAccountingAllSiteTypesTest.php`)
could not run: no PHP interpreter, no Docker, and no root for `apt-get install php-cli`
in the sandbox. The PHP changes are covered only by the static checks above.

After applying, run on the server:

```bash
php artisan migrate          # backfills accounting activations for existing tenants
```
