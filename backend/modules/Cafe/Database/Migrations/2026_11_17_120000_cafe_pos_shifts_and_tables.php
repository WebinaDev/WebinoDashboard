<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cashier shifts and the cash drawer.
 *
 * A shift is the unit every POS money question hangs off: what was in the drawer when it
 * opened, what the system thinks should be there now, what the cashier actually counted at
 * close, and therefore the variance. Order rows already record how they were tendered
 * (payment_tender / amount_paid_minor), so reconciliation is a query over orders that fall
 * inside the shift window — no duplicated money ledger to drift out of sync.
 *
 * Additive and idempotent: each table is guarded with hasTable so a partially migrated
 * tenant database re-runs cleanly.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cafe_shifts')) {
            Schema::create('cafe_shifts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                // open | closed
                $table->string('status', 16)->default('open');
                // What the cashier put in the drawer before the first sale.
                $table->unsignedBigInteger('opening_float_minor')->default(0);
                // Cash the cashier counts at close; null until the count is submitted.
                $table->unsignedBigInteger('counted_cash_minor')->nullable();
                // Cached reconciliation, frozen at close so a later order edit cannot rewrite history.
                $table->unsignedBigInteger('expected_cash_minor')->nullable();
                $table->bigInteger('variance_minor')->default(0);
                $table->json('totals')->nullable();
                $table->string('note', 500)->nullable();
                $table->timestamp('opened_at')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();

                // One open shift per cashier: the service layer enforces it, this guards races.
                $table->index(['tenant_id', 'user_id', 'status'], 'cafe_shifts_user_status_idx');
                $table->index(['tenant_id', 'status'], 'cafe_shifts_tenant_status_idx');
            });
        }

        if (! Schema::hasTable('cafe_shift_movements')) {
            Schema::create('cafe_shift_movements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('shift_id')->constrained('cafe_shifts')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                // cash_in | cash_out | drop | no_sale | note
                $table->string('type', 16);
                $table->bigInteger('amount_minor')->default(0);
                $table->string('reason', 255)->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'shift_id', 'type'], 'cafe_shift_movements_shift_type_idx');
            });
        }

        // Live table state for the floor plan. CafeTable itself stays the physical inventory
        // (code/label/seats); these columns are the ephemeral "what is happening now" layer.
        if (Schema::hasTable('cafe_tables')) {
            // Columns must be added inside Schema::table(): the previous version called
            // $table->string() on an undefined variable, which aborted the migration (and
            // therefore the container boot) on every tenant that already had cafe_tables.
            Schema::table('cafe_tables', function (Blueprint $table) {
                if (! Schema::hasColumn('cafe_tables', 'status')) {
                    // free | seated | ordered | reserved | preparing | ready | cleaning
                    $table->string('status', 16)->default('free')->after('is_active');
                }
                if (! Schema::hasColumn('cafe_tables', 'status_changed_at')) {
                    $table->timestamp('status_changed_at')->nullable()->after('status');
                }
                if (! Schema::hasColumn('cafe_tables', 'active_order_id')) {
                    $table->unsignedBigInteger('active_order_id')->nullable()->after('status_changed_at');
                }
                if (! Schema::hasColumn('cafe_tables', 'reservation_name')) {
                    $table->string('reservation_name', 120)->nullable()->after('active_order_id');
                }
                if (! Schema::hasColumn('cafe_tables', 'reserved_for_at')) {
                    $table->timestamp('reserved_for_at')->nullable()->after('reservation_name');
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cafe_shift_movements');
        Schema::dropIfExists('cafe_shifts');

        if (Schema::hasTable('cafe_tables')) {
            foreach (['reserved_for_at', 'reservation_name', 'active_order_id', 'status_changed_at', 'status'] as $col) {
                if (Schema::hasColumn('cafe_tables', $col)) {
                    Schema::table('cafe_tables', function (Blueprint $table) use ($col) {
                        $table->dropColumn($col);
                    });
                }
            }
        }
    }
};
