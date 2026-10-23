<?php

namespace App\Services\Poetry;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Current tenant for the Poetry models. Set by the PoetryTenantScope middleware; every
 * PoetryPoem/PoetryTerm query is filtered by it and new rows get it as tenant_id.
 * With no tenant set, queries match nothing (fail closed).
 */
class PoetryScope
{
    private static ?int $tenantId = null;

    public static function set(?int $id): void
    {
        self::$tenantId = $id && $id > 0 ? $id : null;
    }

    public static function current(): ?int
    {
        return self::$tenantId;
    }

    public static function id(): int
    {
        return self::$tenantId ?? 0;
    }

    public static function boot(string $model): void
    {
        $model::addGlobalScope('poetry_tenant', fn (Builder $q) => $q->where($q->getModel()->getTable().'.tenant_id', self::id()));
        $model::creating(function (Model $m) {
            if (! $m->tenant_id) {
                $m->tenant_id = self::id();
            }
        });
    }
}
