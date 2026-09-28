<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('analytics_events', function (Blueprint $table) {
            if (! Schema::hasColumn('analytics_events', 'event_type')) {
                $table->string('event_type', 20)->default('pageview');
                $table->index(['tenant_id', 'event_type', 'created_at'], 'analytics_events_tenant_type_created_idx');
            }
            if (! Schema::hasColumn('analytics_events', 'title')) {
                $table->string('title', 255)->default('');
            }
        });

        Schema::table('analytics_page_daily', function (Blueprint $table) {
            if (! Schema::hasColumn('analytics_page_daily', 'title')) {
                $table->string('title', 255)->nullable();
            }
        });

        if (Schema::hasTable('role_capabilities')) {
            $exists = DB::table('role_capabilities')
                ->where('role', 'shop_manager')
                ->where('capability', 'analytics.view')
                ->exists();
            if (! $exists) {
                DB::table('role_capabilities')->insert([
                    'role' => 'shop_manager',
                    'capability' => 'analytics.view',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            Cache::forget('role_capabilities:shop_manager');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('role_capabilities')) {
            DB::table('role_capabilities')
                ->where('role', 'shop_manager')
                ->where('capability', 'analytics.view')
                ->delete();
            Cache::forget('role_capabilities:shop_manager');
        }

        Schema::table('analytics_page_daily', function (Blueprint $table) {
            $table->dropColumn('title');
        });

        Schema::table('analytics_events', function (Blueprint $table) {
            $table->dropIndex('analytics_events_tenant_type_created_idx');
            $table->dropColumn(['event_type', 'title']);
        });
    }
};
