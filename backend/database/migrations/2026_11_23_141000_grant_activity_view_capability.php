<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Grants `activity.view` to the roles that already audit operational data.
 *
 * A brand-new capability row is invisible to every tenant that has already configured its
 * own role matrix (`tenant_role_access_settings`), so those tenants get an explicit row here
 * rather than silently losing the feature. Admin is wildcard and needs nothing.
 */
return new class extends Migration
{
    /** @var list<string> */
    private array $roles = ['staff', 'shop_manager', 'accountant'];

    public function up(): void
    {
        $this->grant();
    }

    public function down(): void
    {
        $this->revoke();
    }

    private function grant(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        $columns = array_flip(Schema::getColumnListing('role_capabilities'));
        $scoped = isset($columns['tenant_id']);

        // Global defaults first, then one row per tenant that has its own matrix.
        $targets = [null];
        if ($scoped && Schema::hasTable('tenant_role_access_settings')) {
            $targets = array_merge($targets, DB::table('tenant_role_access_settings')
                ->distinct()
                ->pluck('tenant_id')
                ->all());
        }

        foreach ($targets as $tenantId) {
            foreach ($this->roles as $role) {
                $query = DB::table('role_capabilities')->where('role', $role)->where('capability', 'activity.view');
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
                    'capability' => 'activity.view',
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                if ($scoped) {
                    $row['tenant_id'] = $tenantId;
                }

                DB::table('role_capabilities')->insert($row);
            }
        }

        $this->flush();
    }

    private function revoke(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        DB::table('role_capabilities')->where('capability', 'activity.view')->delete();

        $this->flush();
    }

    private function flush(): void
    {
        // Both cache key shapes: the legacy one and the tenant-scoped one added later.
        foreach ($this->roles as $role) {
            Cache::forget('role_capabilities:global:'.$role);
            Cache::forget('role_capabilities:'.$role);
        }

        if (! Schema::hasTable('tenants')) {
            return;
        }

        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach ($this->roles as $role) {
                Cache::forget('role_capabilities:'.$tenantId.':'.$role);
            }
        }
    }
};
