<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Halls, terraces, the bar counter.
 *
 * A twenty-table café is not one room: a waiter works the terrace and does not want the first
 * floor in the way, and a host seating a guest needs to know which of the two a table is in.
 * The table list had `sort_order` and nothing else to organise by, so the only way to express
 * "T1..T9 upstairs" was the numbering itself — which then reads as T10 after T1.
 *
 * `area` is a free label rather than a table of its own, because halls are named by the shop
 * (`سالن اصلی`, `تراس`, `بار`) and there is nothing about them to configure beyond the name.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cafe_tables') || Schema::hasColumn('cafe_tables', 'area')) {
            return;
        }

        Schema::table('cafe_tables', function (Blueprint $table): void {
            $table->string('area', 60)->nullable()->after('label');
        });

        $indexes = array_map(static fn ($index): string => (string) ($index['name'] ?? ''), Schema::getIndexes('cafe_tables'));

        if (! in_array('cafe_tables_tenant_area_idx', $indexes, true)) {
            Schema::table('cafe_tables', function (Blueprint $table): void {
                $table->index(['tenant_id', 'area'], 'cafe_tables_tenant_area_idx');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('cafe_tables') || ! Schema::hasColumn('cafe_tables', 'area')) {
            return;
        }

        Schema::table('cafe_tables', function (Blueprint $table): void {
            $indexes = array_map(static fn ($index): string => (string) ($index['name'] ?? ''), Schema::getIndexes('cafe_tables'));
            if (in_array('cafe_tables_tenant_area_idx', $indexes, true)) {
                $table->dropIndex('cafe_tables_tenant_area_idx');
            }
            $table->dropColumn('area');
        });
    }
};
