<?php

namespace Modules\Accounting\Database\Seeders;

use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccChartAccount;

/**
 * Seeds the Iranian chart of accounts for the current tenant.
 *
 * Two changes from the ERP seeder, both required here:
 *
 * 1. The data file is located with `__DIR__` instead of `module_path()`. That helper
 *    belongs to nwidart/laravel-modules, which this application does not install — it
 *    discovers modules through {@see \App\Kernel\ModuleDiscovery} instead.
 *
 * 2. `tenant_id` comes from {@see AccChartAccount}'s trait, not from this seeder. Called
 *    from the `POST /chart/seed` route it stamps the signed-in user's tenant, which is
 *    what that route needs. Called from artisan there is no tenant to stamp, so the
 *    insert fails on a non-nullable column — seed a chart through the API, or wrap a
 *    console call in `AccChartAccount::withoutTenancy()` and pass `tenant_id` yourself.
 */
class AccChartIranSeeder
{
    /**
     * @return array{inserted:int, skipped:int}
     */
    public static function run(): array
    {
        $rows = require __DIR__.'/../data/chart-iran.php';

        $codeToId = [];
        $inserted = 0;
        $skipped = 0;

        // Shortest code first: parent codes are prefixes of their children (1, 11, 1101).
        usort($rows, fn (array $a, array $b): int => strlen((string) $a['code']) <=> strlen((string) $b['code']));

        foreach ($rows as $row) {
            $existing = AccChartAccount::query()->where('code', $row['code'])->value('id');

            if ($existing !== null) {
                $skipped++;
                $codeToId[$row['code']] = (int) $existing;

                continue;
            }

            $parentId = null;

            if (! empty($row['parent_code'])) {
                $parentId = $codeToId[$row['parent_code']]
                    ?? AccChartAccount::query()->where('code', $row['parent_code'])->value('id');
            }

            $account = AccChartAccount::query()->create([
                'code' => $row['code'],
                'name' => $row['name'],
                'parent_id' => $parentId,
                'type' => $row['type'],
                'is_postable' => (bool) $row['is_postable'],
            ]);

            $codeToId[$row['code']] = $account->id;
            $inserted++;
        }

        return ['inserted' => $inserted, 'skipped' => $skipped];
    }

    /**
     * Seed the chart for one explicit tenant, without an authenticated user.
     *
     * Used by first-run provisioning (`AccountingProvisioningService`), which runs
     * during site setup where the request user may not belong to the tenant being
     * provisioned. Inserts go through the query builder so the tenant-stamping hook
     * cannot reject the explicit `tenant_id`.
     *
     * @return array{inserted:int, skipped:int}
     */
    public static function runForTenant(int $tenantId): array
    {
        $rows = require __DIR__.'/../data/chart-iran.php';

        $codeToId = [];
        $inserted = 0;
        $skipped = 0;
        $now = now();

        // Shortest code first: parent codes are prefixes of their children (1, 11, 1101).
        usort($rows, fn (array $a, array $b): int => strlen((string) $a['code']) <=> strlen((string) $b['code']));

        foreach ($rows as $row) {
            $existing = DB::table('acc_chart_accounts')
                ->where('tenant_id', $tenantId)
                ->where('code', $row['code'])
                ->value('id');

            if ($existing !== null) {
                $skipped++;
                $codeToId[$row['code']] = (int) $existing;

                continue;
            }

            $parentId = null;

            if (! empty($row['parent_code'])) {
                $parentId = $codeToId[$row['parent_code']]
                    ?? DB::table('acc_chart_accounts')
                        ->where('tenant_id', $tenantId)
                        ->where('code', $row['parent_code'])
                        ->value('id');
            }

            $id = DB::table('acc_chart_accounts')->insertGetId([
                'tenant_id' => $tenantId,
                'code' => $row['code'],
                'name' => $row['name'],
                'parent_id' => $parentId,
                'type' => $row['type'],
                'is_postable' => (bool) $row['is_postable'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $codeToId[$row['code']] = (int) $id;
            $inserted++;
        }

        return ['inserted' => $inserted, 'skipped' => $skipped];
    }
}
