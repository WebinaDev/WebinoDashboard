<?php

namespace Modules\Accounting\Entities\Concerns;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Tenancy for the accounting module.
 *
 * The ERP this module comes from is single-tenant: its tables have no `tenant_id`
 * and its controllers query without a filter. Dropping that code in here unchanged
 * would let one shop read another shop's ledger, so every entity in this module uses
 * this trait instead of relying on each controller remembering a `where()`.
 *
 * Design notes — these are deliberate and should not be "simplified":
 *
 * 1. A global scope filters on the *current* tenant. This project's existing models
 *    filter explicitly per query; that works for ten hand-written queries and does not
 *    work for ~90 imported ones, because a single missed `where()` is a silent data
 *    leak and nothing fails loudly.
 *
 * 2. The scope is skipped when there is no authenticated tenant (console commands,
 *    migrations, seeders, queue workers without a tenant context). Skipping is safe
 *    because those paths are not reachable from a request; the alternative — scoping
 *    to `tenant_id IS NULL` — would make artisan and tests find nothing and look broken.
 *
 * 3. `tenant_id` is stamped on create from the authenticated user, so a controller
 *    cannot forget to set it. If a tenant is resolved but the model already carries a
 *    different `tenant_id`, that is a programming error and throws rather than writing
 *    a row into someone else's books.
 */
trait BelongsToTenant
{
    /**
     * True while system code deliberately works across tenants. Set only by
     * withoutTenancy() and always restored in a finally block there.
     */
    protected static bool $tenancyBypassed = false;

    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', static function (Builder $builder): void {
            if (static::$tenancyBypassed) {
                return;
            }

            $tenantId = static::currentTenantId();

            if ($tenantId !== null) {
                $builder->where($builder->getModel()->getTable().'.tenant_id', $tenantId);
            }
        });

        static::creating(static function ($model): void {
            $tenantId = static::currentTenantId();

            if ($tenantId === null) {
                return;
            }

            $existing = $model->getAttribute('tenant_id');

            if ($existing === null) {
                $model->setAttribute('tenant_id', $tenantId);

                return;
            }

            // Writing an explicit tenant that is not the active one is how a background
            // job would accidentally post into another shop's ledger. Fail loudly.
            if ((int) $existing !== $tenantId) {
                throw new \RuntimeException(sprintf(
                    'Refusing to write %s row for tenant %d while tenant %d is active.',
                    $model::class,
                    (int) $existing,
                    $tenantId,
                ));
            }
        });
    }

    /**
     * Apply the tenant filter to a query-builder query that has no model.
     *
     * Reporting code reaches for `DB::table('acc_journal_lines as jl')` because it joins
     * three tables and only needs six columns. A raw builder has no global scope, so on
     * its own it would sum every tenant's ledger into one trial balance — the numbers
     * would look plausible and be wrong. Every raw builder query over an `acc_*` table
     * must call this.
     *
     * Returns the builder untouched when there is no active tenant, matching the scope's
     * behaviour for console and seeder code.
     */
    public static function scopeTenant(
        \Illuminate\Database\Query\Builder $builder,
        string $table,
        string $column = 'tenant_id',
    ): \Illuminate\Database\Query\Builder {
        $tenantId = static::currentTenantId();

        if ($tenantId !== null) {
            $builder->where($table.'.'.$column, $tenantId);
        }

        return $builder;
    }

    /** The tenant belonging to the signed-in user, or null outside a request. */
    public static function currentTenantId(): ?int
    {
        $user = Auth::user();
        $tenantId = $user?->tenant_id ?? null;

        return $tenantId === null ? null : (int) $tenantId;
    }

    /**
     * Run a callback with tenancy switched off.
     *
     * Only for migrations, seeders, artisan commands and tests that legitimately span
     * tenants. Never call it from a controller — a request always has a tenant, and
     * bypassing it there is the exact leak this trait exists to prevent.
     *
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function withoutTenancy(callable $callback): mixed
    {
        $previous = static::$tenancyBypassed;
        static::$tenancyBypassed = true;

        try {
            return $callback();
        } finally {
            static::$tenancyBypassed = $previous;
        }
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }
}
