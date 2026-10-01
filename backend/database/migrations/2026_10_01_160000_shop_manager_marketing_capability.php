<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        $exists = DB::table('role_capabilities')
            ->where('role', 'shop_manager')
            ->where('capability', 'marketing.*')
            ->exists();

        if (! $exists) {
            DB::table('role_capabilities')->insert([
                'role' => 'shop_manager',
                'capability' => 'marketing.*',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        Cache::forget('role_capabilities:shop_manager');
    }

    public function down(): void
    {
        if (! Schema::hasTable('role_capabilities')) {
            return;
        }

        DB::table('role_capabilities')
            ->where('role', 'shop_manager')
            ->where('capability', 'marketing.*')
            ->delete();

        Cache::forget('role_capabilities:shop_manager');
    }
};
