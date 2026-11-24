<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which drawer a sale went into, written down instead of inferred from a timestamp.
 *
 * A shift's expected cash was the sum of orders whose `created_at` fell between the shift's
 * open and close. That works only while every sale is recorded the moment it happens — and the
 * till's offline queue exists precisely because it is not. A sale taken at 21:40 on a dead
 * connection and replayed at 09:10 the next morning fell outside every window: the cash was in
 * the drawer, the count was short, and nothing in the system could say why.
 *
 * The column is nullable and deliberately not backfilled by guessing. Existing orders keep their
 * timestamp-based attribution through the OR in `computeTotals`, so no historical shift changes
 * its figures overnight; from here on, an attributed sale belongs to its drawer even if it
 * arrives a day late.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders') && ! Schema::hasColumn('orders', 'shift_id')) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->foreignId('shift_id')->nullable()->after('branch_id')
                    ->constrained('cafe_shifts')->nullOnDelete();

                $table->index(['tenant_id', 'shift_id'], 'orders_shift_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'shift_id')) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->dropIndex('orders_shift_idx');
                $table->dropConstrainedForeignId('shift_id');
            });
        }
    }
};
