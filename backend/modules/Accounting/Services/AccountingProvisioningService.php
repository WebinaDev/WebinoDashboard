<?php

namespace Modules\Accounting\Services;

use Illuminate\Support\Facades\DB;
use Modules\Accounting\Database\Seeders\AccChartIranSeeder;

/**
 * First-run setup for a tenant's ledger: default chart of accounts + current
 * fiscal year.
 *
 * A new tenant used to open the accounting screens to an empty chart, so the first
 * invoice confirm failed with "chart accounts 113 and 401 required" and the
 * dashboard showed zeros. The chart seeder existed but was only reachable through
 * an API route that refused production, and nothing created a fiscal year at all.
 *
 * This service is idempotent — it only fills what is missing — and is called from
 * `TenantActivationService::applySiteType()` (new/re-typed sites) and from
 * `ModuleController::update()` when the module is switched on, so every site type
 * gets a working ledger without a manual seed step.
 *
 * Writes go through the query builder with an explicit `tenant_id`: provisioning
 * runs during site setup, where the request user may not belong to the tenant
 * being provisioned, and the tenant-stamping hook would reject the explicit id.
 */
class AccountingProvisioningService
{
    /**
     * Seed the default chart and current fiscal year for one tenant.
     *
     * @return array{chart_inserted:int, fiscal_year_id:int|null}
     */
    public function ensureSeededForTenant(int $tenantId): array
    {
        $chart = AccChartIranSeeder::runForTenant($tenantId);

        $fiscalYearId = DB::table('acc_fiscal_years')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('starts_on')
            ->value('id');

        if ($fiscalYearId === null) {
            $fiscalYearId = DB::table('acc_fiscal_years')->insertGetId([
                'tenant_id' => $tenantId,
                'title' => (string) now()->format('Y'),
                'starts_on' => now()->startOfYear()->toDateString(),
                'ends_on' => now()->endOfYear()->toDateString(),
                'is_closed' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $hasDefault = DB::table('acc_settings')
            ->where('tenant_id', $tenantId)
            ->where('key', 'accounting_default_fiscal_year_id')
            ->exists();

        if (! $hasDefault) {
            DB::table('acc_settings')->insert([
                'tenant_id' => $tenantId,
                'key' => 'accounting_default_fiscal_year_id',
                'value' => (string) $fiscalYearId,
                'group' => 'general',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return [
            'chart_inserted' => $chart['inserted'],
            'fiscal_year_id' => (int) $fiscalYearId,
        ];
    }
}
