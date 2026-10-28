<?php

namespace App\Observers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Drops the tenant's cached storefront facets (price range, attribute term counts, same-day count)
 * whenever a product, category, brand or attribute changes, instead of waiting out the 5-minute TTL.
 */
class CatalogFacetsObserver
{
    public static function key(int $tenantId): string
    {
        return "catalog-facets:v2:{$tenantId}";
    }

    public static function forget(int $tenantId): void
    {
        if ($tenantId > 0) {
            Cache::forget(self::key($tenantId));
        }
    }

    public function saved(Model $model): void
    {
        self::forget((int) ($model->getAttribute('tenant_id') ?? 0));
    }

    public function deleted(Model $model): void
    {
        $this->saved($model);
    }

    public function restored(Model $model): void
    {
        $this->saved($model);
    }
}
