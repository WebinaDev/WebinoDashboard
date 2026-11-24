<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What kind of waste it was.
 *
 * The waste endpoint has always validated a `kind` — waste, spoilage, staff meal, other — and
 * then dropped it: every loss landed in the ledger with the same reason, so a shop could see
 * that it lost 4 kg this week and never that three of those kilos were spoilage in one fridge.
 * A reason you cannot report on is a reason that changes no behaviour.
 *
 * The column is nullable on purpose: movements recorded before this existed have no kind, and
 * back-filling them with a guess would invent data.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('stock_movements')) {
            return;
        }

        Schema::table('stock_movements', function (Blueprint $table): void {
            if (! Schema::hasColumn('stock_movements', 'waste_kind')) {
                // waste | spoilage | staff_meal | other
                $table->string('waste_kind', 24)->nullable()->after('reason');
                $table->index(['tenant_id', 'waste_kind'], 'stock_movements_waste_kind_idx');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('stock_movements')) {
            return;
        }

        Schema::table('stock_movements', function (Blueprint $table): void {
            if (Schema::hasColumn('stock_movements', 'waste_kind')) {
                $table->dropIndex('stock_movements_waste_kind_idx');
                $table->dropColumn('waste_kind');
            }
        });
    }
};
