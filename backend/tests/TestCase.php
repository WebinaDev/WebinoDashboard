<?php

namespace Tests;

use App\Models\TenantSubmoduleActivation;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function enableSubmodule(int $tenantId, string $moduleSlug, string $submoduleSlug): void
    {
        TenantSubmoduleActivation::query()->updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'module_slug' => $moduleSlug,
                'submodule_slug' => $submoduleSlug,
            ],
            [
                'enabled' => true,
                'licensed' => true,
            ]
        );
    }

    /** @param  array<string, string>  $pairs  module.submodule => true */
    protected function enableSubmodules(int $tenantId, array $pairs): void
    {
        foreach ($pairs as $key => $_) {
            [$module, $sub] = explode('.', $key, 2);
            $this->enableSubmodule($tenantId, $module, $sub);
        }
    }
}
