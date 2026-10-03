<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Guest carts and orders already become nullable in 2026_09_03_000301.
 * This follow-up must not call ->change() when the column is already nullable,
 * because a fresh install may not have a doctrine change driver.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['carts', 'orders'] as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'user_id')) {
                continue;
            }
            if ($this->isNullable($table, 'user_id')) {
                continue;
            }
            $driver = Schema::getConnection()->getDriverName();
            if ($driver === 'pgsql') {
                DB::statement("alter table {$table} alter column user_id drop not null");
            } elseif ($driver === 'mysql') {
                DB::statement("alter table {$table} modify user_id bigint unsigned null");
            }
        }
    }

    public function down(): void
    {
        // Guest cafe carts and unpaid guest orders keep a nullable customer.
    }

    private function isNullable(string $table, string $column): bool
    {
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'sqlite') {
            $rows = DB::select('PRAGMA table_info('.$table.')');
            foreach ($rows as $row) {
                if ((string) ($row->name ?? '') === $column) {
                    return (int) ($row->notnull ?? 1) === 0;
                }
            }

            return true;
        }
        $row = DB::selectOne(
            'select is_nullable from information_schema.columns where table_name = ? and column_name = ?',
            [$table, $column]
        );

        return $row && strtoupper((string) ($row->is_nullable ?? '')) === 'YES';
    }
};
