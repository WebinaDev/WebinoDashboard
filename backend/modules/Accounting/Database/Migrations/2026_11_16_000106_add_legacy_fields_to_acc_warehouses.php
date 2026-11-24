<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('acc_warehouses', function (Blueprint $table) {
            $table->string('code', 64)->nullable()->after('name');
            $table->text('description')->nullable()->after('code');
            $table->text('location')->nullable()->after('address');
        });

        // Backfill location from legacy address column.
        if (Schema::hasColumn('acc_warehouses', 'address')) {
            DB::table('acc_warehouses')
                ->whereNull('location')
                ->whereNotNull('address')
                ->update(['location' => DB::raw('address')]);
        }
    }

    public function down(): void
    {
        Schema::table('acc_warehouses', function (Blueprint $table) {
            $table->dropColumn(['code', 'description', 'location']);
        });
    }
};
