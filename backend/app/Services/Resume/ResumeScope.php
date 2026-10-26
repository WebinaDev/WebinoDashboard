<?php

namespace App\Services\Resume;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/** Current tenant for Resume models (set by ResumeTenantScope). With no tenant, queries match nothing. */
class ResumeScope
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
        $model::addGlobalScope('resume_tenant', fn (Builder $q) => $q->where($q->getModel()->getTable().'.tenant_id', self::id()));
        $model::creating(function (Model $m) {
            if (! $m->tenant_id) {
                $m->tenant_id = self::id();
            }
        });
    }
}
