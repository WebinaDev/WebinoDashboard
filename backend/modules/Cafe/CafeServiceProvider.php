<?php

namespace Modules\Cafe;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The cafe module: menu, POS, kitchen, floor, reservations, delivery, branches.
 *
 * The code used to live in `App\Models`, `App\Services\Cafe` and
 * `App\Http\Controllers\Api\V1`, with its routes inlined in `routes/api.php`. It now
 * lives here, which is what the module kernel already expected — `Modules\Cafe` was a
 * manifest with an empty provider, so `module:cafe_*` gates pointed at a module that
 * could not be installed, disabled, or shipped on its own.
 *
 * What this provider does, in the order the kernel needs it:
 *
 * 1. **Migrations.** `loadMigrationsFrom` keeps the module's own migrations next to its
 *    models, so installing or removing the module moves the schema with it. Filenames
 *    were preserved (including their original dates), so an existing database that
 *    already ran them does not re-run them.
 *
 * 2. **Admin API** at `/api/v1/cafe`. The route file holds the groups verbatim, with
 *    paths made relative to the prefix. Middleware is per-group, exactly as before, so a
 *    cashier loses nothing and a waiter gains nothing.
 *
 * 3. **Public API** at the same prefix, but behind `public.tenant` — the guest menu,
 *    OTP, cart, checkout and printable menu. Those routes stay in `routes/api.php`
 *    because they share controllers with commerce (`PublicGuestCartController`,
 *    `PublicReservationController`); moving the half that belongs to cafe would split a
 *    feature across two modules for no gain.
 *
 * The module is registered automatically: `App\Providers\KernelServiceProvider` walks
 * `backend/modules/*` and registers `{Name}ServiceProvider` when the class exists.
 */
class CafeServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Database/Migrations');

        Route::prefix('v1/cafe')
            ->middleware(['api', 'auth:sanctum'])
            ->group(__DIR__.'/Routes/api.php');
    }
}
