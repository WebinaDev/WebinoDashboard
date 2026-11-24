<?php

namespace Modules\Accounting;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Registers the accounting module's migrations and HTTP surface.
 *
 * Ported from WebinoERP, with three deliberate differences:
 *
 * 1. **Route prefix.** The ERP mounts this module at `/api/v1/accounting`, which is
 *    already taken in this application: `App\Http\Controllers\Api\V1\AccountingController`
 *    serves `/api/v1/accounting/*` for the cafe POS ledger (`accounting_*` tables).
 *    Registering the ERP routes on the same prefix would silently shadow them, because
 *    Laravel matches the first registered route. The ERP module is therefore mounted at
 *    `/api/v1/erp-accounting` and keeps its own `acc_*` tables; the two ledgers coexist.
 *
 * 2. **Middleware.** The ERP uses `module:accounting` + `module.permission:accounting`.
 *    `module:` exists here ({@see \App\Http\Middleware\EnsureModuleEnabled}); the
 *    finer-grained `module.permission` alias does not, so the capability check uses the
 *    existing `can:` middleware with this codebase's `accounting.manage` capability —
 *    the same capability the current accounting routes already require.
 *
 * 3. **No licensing.** The ERP module ships licence-check and module-clone endpoints
 *    that talk to its Core module. This application has no Core licence system, so those
 *    controllers and routes are not registered. Warehouse REST parity
 *    (`/api/webinocrm/v1/*`) is kept: it is a data API, not a licence surface.
 */
class AccountingServiceProvider extends ServiceProvider
{
    private const ROUTE_PREFIX = 'api/v1/erp-accounting';

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Database/Migrations');

        Route::prefix(self::ROUTE_PREFIX)
            ->middleware(['api', 'auth:sanctum', 'module:accounting', 'can:accounting.manage'])
            ->group(__DIR__.'/Routes/api.php');

        // Warehouse/product parity API consumed by the ERP-era dashboard clients.
        Route::prefix('api/webinocrm/v1')
            ->middleware(['api', 'auth:sanctum', 'module:accounting', 'can:accounting.manage'])
            ->group(__DIR__.'/Routes/webinocrm-v1.php');
    }

    public function register(): void
    {
        //
    }
}
