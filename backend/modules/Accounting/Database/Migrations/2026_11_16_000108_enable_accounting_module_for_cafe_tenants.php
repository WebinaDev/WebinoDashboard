<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turns the accounting module on for existing cafe / coffee / ecommerce tenants.
 *
 * {@see \App\Kernel\SiteTypeProfiles} now lists `accounting` for those site types, but the
 * profile is only applied while a tenant is provisioned — it never runs again for a shop
 * that already exists. Without this backfill the module's routes answer 403
 * MODULE_NOT_ACTIVE on every live tenant, which looks like a broken deploy rather than a
 * missing row.
 *
 * Three kinds of row are written, matching what `TenantActivationService::applySiteType()`
 * would have written had these tenants been created after the profile change:
 *
 *   - `site_type_activations`        — one row per submodule, so future tenants get them.
 *   - `tenant_submodule_activations` — the per-tenant switches `module:accounting` reads.
 *   - `tenant_modules`               — the module-level switch, enabled because at least
 *                                      one submodule is on.
 *
 * Rows are written with `insertOrIgnore`, so a tenant that already has them (a shop created
 * after this change) keeps its existing values instead of being reset.
 */
return new class extends Migration
{
    /** Site types whose profile ships the full ledger. */
    private array $siteTypes = ['cafe', 'coffee', 'ecommerce'];

    /** Submodules of the module, mirroring `modules/Accounting/manifest.json`. */
    private array $submodules = [
        'dashboard', 'persons', 'products', 'invoices', 'journals',
        'ledger', 'reports', 'cash', 'checks', 'receipts', 'warehouses', 'settings',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('dashboard_modules') || ! Schema::hasTable('tenants')) {
            return;
        }

        // Manifest sync (ModuleRegistry::syncCatalog) creates this row on boot. Bail out
        // rather than inserting a module definition that would drift from the manifest.
        if (! DB::table('dashboard_modules')->where('slug', 'accounting')->exists()) {
            return;
        }

        $now = now();

        if (Schema::hasTable('submodules')) {
            foreach ($this->submodules as $index => $subSlug) {
                DB::table('submodules')->insertOrIgnore(array_merge([
                    'module_slug' => 'accounting',
                    'slug' => $subSlug,
                ], [
                    'name_fa' => $subSlug,
                    'name_en' => $subSlug,
                    'is_core' => false,
                    'sort_order' => $index,
                    'admin_nav' => null,
                    'public_routes' => json_encode([]),
                    'updated_at' => $now,
                    'created_at' => $now,
                ]));
            }
        }

        if (Schema::hasTable('site_type_activations')) {
            $known = DB::table('site_type_activations')
                ->whereIn('site_type_slug', $this->siteTypes)
                ->distinct()
                ->pluck('site_type_slug')
                ->all();

            foreach ($known as $siteType) {
                foreach ($this->submodules as $subSlug) {
                    DB::table('site_type_activations')->insertOrIgnore(array_merge([
                        'site_type_slug' => $siteType,
                        'module_slug' => 'accounting',
                        'submodule_slug' => $subSlug,
                    ], [
                        'enabled_by_default' => true,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]));
                }
            }
        }

        $tenantIds = DB::table('tenants')
            ->whereIn('site_type_slug', $this->siteTypes)
            ->pluck('id');

        if (Schema::hasTable('tenant_submodule_activations')) {
            foreach ($tenantIds as $tenantId) {
                foreach ($this->submodules as $subSlug) {
                    DB::table('tenant_submodule_activations')->insertOrIgnore(array_merge([
                        'tenant_id' => $tenantId,
                        'module_slug' => 'accounting',
                        'submodule_slug' => $subSlug,
                    ], [
                        // Enabled, not merely available: this migration exists because
                        // the operator already expects the module for these site types,
                        // and `module:accounting` refuses traffic on a disabled submodule.
                        'enabled' => true,
                        'licensed' => true,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]));
                }
            }
        }

        if (! Schema::hasTable('tenant_modules')) {
            return;
        }

        foreach ($tenantIds as $tenantId) {
            DB::table('tenant_modules')->insertOrIgnore(array_merge([
                'tenant_id' => $tenantId,
                'module_slug' => 'accounting',
            ], [
                'enabled' => true,
                'licensed' => true,
                'updated_at' => $now,
                'created_at' => $now,
            ]));
        }
    }

    public function down(): void
    {
        // Activations are left in place: dropping them would 403 pages that already hold
        // journals, and turning a module off is an operator decision, not a rollback.
    }
};
