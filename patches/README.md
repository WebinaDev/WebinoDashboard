# Patches for the deployed lineage (`main`)

The Arena branch (`arena/8a3cfd3b-webinodashboard`) and `main` have **unrelated git
histories** — `git merge-base origin/main arena/8a3cfd3b-webinodashboard` returns nothing,
and 308 files differ between them. So this branch cannot be merged into `main`; the changes
have to travel as patches.

Apply all of them from the repository root of a `main` checkout:

```bash
git apply patches/main-ts2322-useinview.patch                 # 1. unblocks the Docker build
git apply patches/main-accounting-applies-cleanly.patch       # 2. safe subset (24 files)
git apply --reject patches/main-accounting-needs-porting.patch # 3. manual merge needed (14 files)
```

## 1. `main-ts2322-useinview.patch` — required, one line

`frontend/src/builder/render/extra-widgets.tsx:651` declares
`[RefObject<T>, boolean]` while `useRef<T>(null)` returns `RefObject<T | null>` under
React 19 types. This is the only TypeScript error on `main` and it is what fails
`platform.dashboard_rebuild_failed`.

Verified on a checkout of `main` (eab7793) with its own `package-lock.json`:

| state | `npx tsc --noEmit -p tsconfig.json` |
|---|---|
| `main` as-is | exit 2 — `extra-widgets.tsx(667,11): error TS2322` |
| `main` + this patch | exit 0 |

## 2. `main-accounting-applies-cleanly.patch` — 24 files

Module alias, `EnsureModuleEnabled` fallback, site-type profiles, provisioning service,
REST controllers, frontend registry/route-resolver/list-utils, manifest slug + site types.
Applies with no fuzz and keeps the typecheck green:

| state | `npx tsc --noEmit` |
|---|---|
| `main` + patch 1 + patch 2 | exit 0 |

## 3. `main-accounting-needs-porting.patch` — 14 files, manual

These files diverged on `main` and need a hand merge. Note that
`AccJournals.tsx` belongs here even though its hunk applies cleanly: it reads
`res.meta`, which only exists once `lib/api-client.ts` exposes `meta`.

- backend: `AccountingServiceProvider.php`, `AccInvoiceController.php`,
  `CashAccountController.php`, `CheckController.php`, `FinancialReportsController.php`,
  `ReceiptController.php`, `Routes/api.php`, `AccountingWpActionService.php`
- frontend: `messages/en.json`, `messages/fa.json`, `AccFiscalYear.tsx`,
  `AccReports.tsx`, `AccJournals.tsx`, `lib/api-client.ts`
