<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Accounting returned 403 on every endpoint (`/api/v1/accounting/*`), so the dashboard page
 * could not list invoices, create a person, or save anything.
 *
 * Root cause: `accounting` was never a declared commerce submodule. It was absent from
 * `modules/Commerce/manifest.json` and from every site-type profile, so no
 * `tenant_submodule_activations` row was ever created and `module:accounting` rejected all
 * traffic with MODULE_NOT_ACTIVE.
 *
 * Both sources are fixed alongside this migration. This backfills tenants that already
 * exist, because `applySiteType` only runs while provisioning and would also rewrite the
 * tenant's theme.
 */
return new class extends Migration
{
    /** Site types that ship a commerce module and therefore a ledger. */
    private array $siteTypes = ['ecommerce', 'cafe', 'coffee'];

    public function up(): void
    {
        if (! Schema::hasTable('tenants') || ! Schema::hasTable('tenant_submodule_activations')) {
            return;
        }

        if (! Schema::hasTable('dashboard_modules') || ! DB::table('dashboard_modules')->where('slug', 'commerce')->exists()) {
            return;
        }

        $now = now();

        if (Schema::hasTable('submodules')) {
            $exists = DB::table('submodules')
                ->where('module_slug', 'commerce')
                ->where('slug', 'accounting')
                ->exists();

            if (! $exists) {
                $sortOrder = (int) DB::table('submodules')
                    ->where('module_slug', 'commerce')
                    ->max('sort_order');

                DB::table('submodules')->insert([
                    'module_slug' => 'commerce',
                    'slug' => 'accounting',
                    'name_fa' => 'accounting',
                    'name_en' => 'accounting',
                    'is_core' => false,
                    'sort_order' => $sortOrder + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        if (Schema::hasTable('site_type_activations')) {
            $known = DB::table('site_type_activations')
                ->whereIn('site_type_slug', $this->siteTypes)
                ->distinct()
                ->pluck('site_type_slug')
                ->all();

            foreach ($known as $siteType) {
                DB::table('site_type_activations')->insertOrIgnore(
                    array_merge([
                        'site_type_slug' => $siteType,
                        'module_slug' => 'commerce',
                        'submodule_slug' => 'accounting',
                    ], [
                        'enabled_by_default' => true,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ])
                );
            }
        }

        $tenantIds = DB::table('tenants')
            ->whereIn('site_type_slug', $this->siteTypes)
            ->pluck('id');

        foreach ($tenantIds as $tenantId) {
            DB::table('tenant_submodule_activations')->insertOrIgnore(
                array_merge([
                    'tenant_id' => $tenantId,
                    'module_slug' => 'commerce',
                    'submodule_slug' => 'accounting',
                ], [
                    'enabled' => false,
                    'licensed' => false,
                    'updated_at' => $now,
                    'created_at' => $now,
                ])
            );
        }
    }

    public function down(): void
    {
        // Keep activations: disabling would 403 pages that started writing journals.
    }
};
