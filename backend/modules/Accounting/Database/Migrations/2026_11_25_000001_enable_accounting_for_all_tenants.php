<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Accounting on every site type, for tenants that already exist.
 *
 * `SiteTypeProfiles` now lists the `accounting` module for all seven site types,
 * but the profile is only applied while a tenant is provisioned — it never runs
 * again for a shop that already exists. Without this backfill, magazine / blog /
 * resume / corporate tenants (and ecommerce tenants, which only ever got the
 * commerce till ledger) keep answering 403 MODULE_NOT_ACTIVE on
 * `/api/v1/erp-accounting/*`.
 *
 * Also enables `commerce.accounting` (the till ledger) for commerce tenants: the
 * earlier backfill created that row with `enabled=false`, so the till ledger's own
 * API was gated off even where the UI implied it.
 *
 * Rows are written with `insertOrIgnore` / `updateOrCreate`, so a tenant that
 * already has them keeps its existing values instead of being reset.
 */
return new class extends Migration
{
    /** Every site type ships the full ledger now. */
    private array $siteTypes = ['ecommerce', 'magazine', 'cafe', 'coffee', 'resume', 'blog', 'corporate'];

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
                DB::table('submodules')->insertOrIgnore([
                    'module_slug' => 'accounting',
                    'slug' => $subSlug,
                    'name_fa' => $subSlug,
                    'name_en' => $subSlug,
                    'is_core' => false,
                    'sort_order' => $index,
                    'admin_nav' => null,
                    'public_routes' => json_encode([]),
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
                foreach ($this->submodules as $subSlug) {
                    DB::table('site_type_activations')->insertOrIgnore([
                        'site_type_slug' => $siteType,
                        'module_slug' => 'accounting',
                        'submodule_slug' => $subSlug,
                        'enabled_by_default' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        $tenantIds = DB::table('tenants')->pluck('id');

        if (Schema::hasTable('tenant_submodule_activations')) {
            foreach ($tenantIds as $tenantId) {
                foreach ($this->submodules as $subSlug) {
                    DB::table('tenant_submodule_activations')->insertOrIgnore([
                        'tenant_id' => $tenantId,
                        'module_slug' => 'accounting',
                        'submodule_slug' => $subSlug,
                        'enabled' => true,
                        'licensed' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        if (Schema::hasTable('tenant_modules')) {
            foreach ($tenantIds as $tenantId) {
                DB::table('tenant_modules')->insertOrIgnore([
                    'tenant_id' => $tenantId,
                    'module_slug' => 'accounting',
                    'enabled' => true,
                    'licensed' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        // Till ledger: flip the disabled backfill row on for tenants that have commerce.
        if (Schema::hasTable('tenant_submodule_activations')) {
            DB::table('tenant_submodule_activations')
                ->where('module_slug', 'commerce')
                ->where('submodule_slug', 'accounting')
                ->where('enabled', false)
                ->update(['enabled' => true, 'licensed' => true, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        // Activations are left in place: dropping them would 403 pages that already hold
        // journals, and turning a module off is an operator decision, not a rollback.
    }
};
