<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Grants `staff.manage` to the roles that should already have had it.
 *
 * The cafe role matrix shipped before there was anything to manage: no rota, no payroll. Now
 * that there is, a branch manager who cannot publish next week's rota or build a payroll run
 * is blocked by a permission that was simply never written. `admin` and `owner` are unaffected
 * (they hold `*`), and nobody loses anything here — this only adds.
 */
return new class extends Migration
{
    /** Roles that get the capability, matching config/capabilities.php. */
    private const ROLES = ['branch_manager', 'accountant'];

    public function up(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        $columns = array_flip(Schema::getColumnListing('role_capabilities'));
        $scoped = isset($columns['tenant_id']);
        $now = now();

        $targets = [null];
        if ($scoped && Schema::hasTable('tenants')) {
            $targets = array_merge($targets, DB::table('tenants')->pluck('id')->all());
        }

        $rows = [];
        foreach ($targets as $tenantId) {
            foreach (self::ROLES as $role) {
                $query = DB::table('role_capabilities')
                    ->where('role', $role)
                    ->where('capability', 'staff.manage');

                $scoped
                    ? ($tenantId === null ? $query->whereNull('tenant_id') : $query->where('tenant_id', $tenantId))
                    : null;

                if ($query->exists()) {
                    continue;
                }

                $row = [
                    'role' => $role,
                    'capability' => 'staff.manage',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
                if ($scoped) {
                    $row['tenant_id'] = $tenantId;
                }

                $rows[] = $row;
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('role_capabilities')->insert($chunk);
        }

        $this->flush();
    }

    public function down(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        DB::table('role_capabilities')
            ->whereIn('role', self::ROLES)
            ->where('capability', 'staff.manage')
            ->delete();

        $this->flush();
    }

    private function flush(): void
    {
        foreach (self::ROLES as $role) {
            Cache::forget('role_capabilities:global:'.$role);
            Cache::forget('role_capabilities:'.$role);
        }

        if (! Schema::hasTable('tenants')) {
            return;
        }

        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach (self::ROLES as $role) {
                Cache::forget('role_capabilities:'.$tenantId.':'.$role);
            }
        }
    }
};
