<?php

use App\Support\CapabilityChecker;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('order_notes') && ! Schema::hasColumn('order_notes', 'meta')) {
            Schema::table('order_notes', function (Blueprint $table) {
                $table->json('meta')->nullable();
            });
        }

        if (Schema::hasTable('role_capabilities')) {
            $exists = DB::table('role_capabilities')
                ->where('role', 'subscriber')
                ->where('capability', 'account.portal')
                ->exists();
            if (! $exists) {
                DB::table('role_capabilities')->insert([
                    'role' => 'subscriber',
                    'capability' => 'account.portal',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            CapabilityChecker::flushRoleCache('subscriber');

            $support = DB::table('role_capabilities')
                ->where('role', 'shop_manager')
                ->where('capability', 'support.*')
                ->exists();
            if (! $support) {
                DB::table('role_capabilities')->insert([
                    'role' => 'shop_manager',
                    'capability' => 'support.*',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            CapabilityChecker::flushRoleCache('shop_manager');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('order_notes') && Schema::hasColumn('order_notes', 'meta')) {
            Schema::table('order_notes', function (Blueprint $table) {
                $table->dropColumn('meta');
            });
        }
        if (Schema::hasTable('role_capabilities')) {
            DB::table('role_capabilities')
                ->where('role', 'subscriber')
                ->where('capability', 'account.portal')
                ->delete();
            CapabilityChecker::flushRoleCache('subscriber');
            DB::table('role_capabilities')
                ->where('role', 'shop_manager')
                ->where('capability', 'support.*')
                ->delete();
            CapabilityChecker::flushRoleCache('shop_manager');
        }
    }
};
