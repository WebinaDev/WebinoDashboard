<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wallet_ledger')) {
            return;
        }
        $driver = Schema::getConnection()->getDriverName();
        if (! in_array($driver, ['sqlite', 'pgsql'], true)) {
            return;
        }
        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_return_credit_uid ON wallet_ledger (tenant_id, ref_type, ref_id, direction) WHERE ref_type = 'order_return' AND ref_id IS NOT NULL");
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['sqlite', 'pgsql'], true)) {
            DB::statement('DROP INDEX IF EXISTS wallet_ledger_return_credit_uid');
        }
    }
};
