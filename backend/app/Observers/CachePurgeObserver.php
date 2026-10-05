<?php

namespace App\Observers;

use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Product;
use App\Services\Performance\PerformanceSettingsService;

class CachePurgeObserver
{
    public function __construct(protected PerformanceSettingsService $perf) {}

    public function saved(Product|BlogPost|CmsPage $model): void
    {
        $tid = (int) ($model->tenant_id ?? 0);
        if ($tid < 1) {
            return;
        }
        $kind = $model instanceof Product ? 'product' : 'content';
        $this->perf->maybePurge($tid, $kind);
    }

    public function deleted(Product|BlogPost|CmsPage $model): void
    {
        $this->saved($model);
    }
}
