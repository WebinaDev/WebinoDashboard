<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seeds the cafe role matrix into `role_capabilities`.
 *
 * Two things this has to get right:
 *  - a tenant that already configured its own matrix must still receive these roles, which
 *    means a per-tenant row, not only a global one;
 *  - `seller` and `shop_manager` keep working for existing shops, they are simply no longer
 *    the only option. Nothing is revoked here, because demoting a live shift mid-service
 *    would lock staff out of the till.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        /** @var array<string, list<string>> $matrix */
        $matrix = config('capabilities.cafe_roles', []);

        if ($matrix === []) {
            return;
        }

        $columns = array_flip(Schema::getColumnListing('role_capabilities'));
        $scoped = isset($columns['tenant_id']);

        $targets = [null];
        if ($scoped && Schema::hasTable('tenant_role_access_settings')) {
            $targets = array_merge($targets, DB::table('tenant_role_access_settings')
                ->distinct()
                ->pluck('tenant_id')
                ->all());
        }

        $now = now();
        $rows = [];

        foreach ($targets as $tenantId) {
            foreach ($matrix as $role => $capabilities) {
                foreach ($capabilities as $capability) {
                    $query = DB::table('role_capabilities')
                        ->where('role', $role)
                        ->where('capability', $capability);

                    if ($scoped) {
                        $tenantId === null
                            ? $query->whereNull('tenant_id')
                            : $query->where('tenant_id', $tenantId);
                    }

                    if ($query->exists()) {
                        continue;
                    }

                    $row = [
                        'role' => $role,
                        'capability' => $capability,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                    if ($scoped) {
                        $row['tenant_id'] = $tenantId;
                    }

                    $rows[] = $row;
                }
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('role_capabilities')->insert($chunk);
        }

        $this->flush($matrix);
    }

    public function down(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        DB::table('role_capabilities')
            ->whereIn('role', ['cashier', 'waiter', 'cook', 'branch_manager', 'owner'])
            ->delete();

        $this->flush(config('capabilities.cafe_roles', []));
    }

    /** @param  array<string, list<string>>  $matrix */
    private function flush(array $matrix): void
    {
        foreach (array_keys($matrix) as $role) {
            Cache::forget('role_capabilities:global:'.$role);
            Cache::forget('role_capabilities:'.$role);
        }

        if (! Schema::hasTable('tenants')) {
            return;
        }

        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach (array_keys($matrix) as $role) {
                Cache::forget('role_capabilities:'.$tenantId.':'.$role);
            }
        }
    }
};
