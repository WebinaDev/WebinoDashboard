<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Grants the two capabilities the daily-operations screens need.
 *
 * `pos.settle` and `orders.amend` are new, and a tenant that already configured its own
 * role matrix would never see a global row — the same trap as the activity log.
 */
return new class extends Migration
{
    /** @var array<string, list<string>> */
    private array $grants = [
        'cashier' => ['pos.settle', 'orders.amend'],
        'waiter' => ['orders.amend'],
        'branch_manager' => ['pos.settle', 'orders.amend'],
        'owner' => ['pos.settle', 'orders.amend'],
        'staff' => ['pos.settle', 'orders.amend'],
        'shop_manager' => ['pos.settle', 'orders.amend'],
    ];

    public function up(): void
    {
        $this->apply(true);
    }

    public function down(): void
    {
        $this->apply(false);
    }

    private function apply(bool $grant): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        $columns = array_flip(Schema::getColumnListing('role_capabilities'));
        $scoped = isset($columns['tenant_id']);

        if (! $grant) {
            DB::table('role_capabilities')
                ->whereIn('capability', ['pos.settle', 'orders.amend'])
                ->delete();
            $this->flush();

            return;
        }

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
            foreach ($this->grants as $role => $capabilities) {
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

        $this->flush();
    }

    private function flush(): void
    {
        foreach (array_keys($this->grants) as $role) {
            Cache::forget('role_capabilities:global:'.$role);
            Cache::forget('role_capabilities:'.$role);
        }

        if (! Schema::hasTable('tenants')) {
            return;
        }

        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach (array_keys($this->grants) as $role) {
                Cache::forget('role_capabilities:'.$tenantId.':'.$role);
            }
        }
    }
};
