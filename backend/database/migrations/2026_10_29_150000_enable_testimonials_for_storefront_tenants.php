<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Parisma (and other ecommerce/cafe/… tenants) returned 404 on /api/v1/public/testimonials
 * because corporate.testimonials was only licensed for the corporate site type.
 * Enable the parent module + testimonials submodule for storefront site types without
 * re-running applySiteType (which would rewrite themes).
 */
return new class extends Migration
{
    /** @var list<string> */
    private array $siteTypes = ['ecommerce', 'magazine', 'cafe', 'coffee', 'blog'];

    public function up(): void
    {
        if (! Schema::hasTable('tenants') || ! Schema::hasTable('tenant_modules')) {
            return;
        }

        $now = now();

        if (Schema::hasTable('dashboard_modules')) {
            DB::table('dashboard_modules')->updateOrInsert(
                ['slug' => 'corporate'],
                [
                    'distribution' => 'git',
                    'requires_license' => true,
                    'default_version' => '1.0.0',
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );
        }

        if (Schema::hasTable('site_type_activations')) {
            foreach ($this->siteTypes as $siteType) {
                DB::table('site_type_activations')->updateOrInsert(
                    [
                        'site_type_slug' => $siteType,
                        'module_slug' => 'corporate',
                        'submodule_slug' => 'testimonials',
                    ],
                    [
                        'enabled_by_default' => true,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]
                );
            }
        }

        $tenantIds = DB::table('tenants')
            ->whereIn('site_type_slug', $this->siteTypes)
            ->pluck('id');

        foreach ($tenantIds as $tenantId) {
            DB::table('tenant_modules')->updateOrInsert(
                ['tenant_id' => $tenantId, 'module_slug' => 'corporate'],
                [
                    'enabled' => true,
                    'licensed' => true,
                    'synced_at' => $now,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );

            if (Schema::hasTable('tenant_submodule_activations')) {
                DB::table('tenant_submodule_activations')->updateOrInsert(
                    [
                        'tenant_id' => $tenantId,
                        'module_slug' => 'corporate',
                        'submodule_slug' => 'testimonials',
                    ],
                    [
                        'enabled' => true,
                        'licensed' => true,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]
                );
            }
        }
    }

    public function down(): void
    {
        // Keep activations; disabling would break pages that started using testimonials.
    }
};
