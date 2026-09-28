<?php

namespace Tests;

use App\Models\Tenant;
use App\Models\TenantSubmoduleActivation;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    protected function createTenant(array $overrides = []): Tenant
    {
        $slug = $overrides['slug'] ?? 'shop-'.Str::lower(Str::random(8));

        return Tenant::query()->create(array_merge([
            'name' => 'Shop',
            'slug' => $slug,
            'domain' => $slug.'.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRR',
        ], $overrides));
    }

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
