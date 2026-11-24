<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blind cash counts, manager approval, day close and the shift's journal.
 *
 * A drawer could previously be closed by the cashier alone, with the expected figure visible
 * on screen while they typed the count. That is not a control — it is a form that rewards
 * typing the number above it. These columns make the count blind (the expected figure is not
 * returned to the cashier before submission), make a difference need a second signature, and
 * give the close an accounting footprint instead of a status flag.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('cafe_shifts')) {
            Schema::table('cafe_shifts', function (Blueprint $table) {
                // counted | pending_approval | approved | rejected
                if (! Schema::hasColumn('cafe_shifts', 'count_status')) {
                    $table->string('count_status', 20)->nullable()->after('counted_cash_minor');
                }
                if (! Schema::hasColumn('cafe_shifts', 'counted_by')) {
                    $table->unsignedBigInteger('counted_by')->nullable()->after('count_status');
                }
                if (! Schema::hasColumn('cafe_shifts', 'counted_at')) {
                    $table->timestamp('counted_at')->nullable()->after('counted_by');
                }
                if (! Schema::hasColumn('cafe_shifts', 'approved_by')) {
                    $table->unsignedBigInteger('approved_by')->nullable()->after('counted_at');
                }
                if (! Schema::hasColumn('cafe_shifts', 'approved_at')) {
                    $table->timestamp('approved_at')->nullable()->after('approved_by');
                }
                if (! Schema::hasColumn('cafe_shifts', 'approval_note')) {
                    $table->string('approval_note', 500)->nullable()->after('approved_at');
                }
                // The journal cut for this drawer's takings, once closed and posted.
                if (! Schema::hasColumn('cafe_shifts', 'journal_entry_id')) {
                    $table->unsignedBigInteger('journal_entry_id')->nullable()->after('approval_note');
                }
                if (! Schema::hasColumn('cafe_shifts', 'day_close_id')) {
                    $table->unsignedBigInteger('day_close_id')->nullable()->after('journal_entry_id');
                }
            });
        }

        // One row per business day, per branch: the manager signs off the day, not the shift.
        if (! Schema::hasTable('cafe_day_closes')) {
            Schema::create('cafe_day_closes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                $table->date('business_date');
                // open | closed
                $table->string('status', 16)->default('open');
                $table->unsignedInteger('shifts')->default(0);
                $table->bigInteger('gross_sales_minor')->default(0);
                $table->bigInteger('cash_sales_minor')->default(0);
                $table->bigInteger('non_cash_sales_minor')->default(0);
                $table->bigInteger('discounts_minor')->default(0);
                $table->bigInteger('tax_minor')->default(0);
                $table->bigInteger('expected_cash_minor')->default(0);
                $table->bigInteger('counted_cash_minor')->default(0);
                $table->bigInteger('variance_minor')->default(0);
                $table->json('totals')->nullable();
                $table->string('note', 500)->nullable();
                $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();

                // A shop can only close the same day once.
                $table->unique(['tenant_id', 'branch_id', 'business_date'], 'cafe_day_closes_unique');
                $table->index(['tenant_id', 'business_date'], 'cafe_day_closes_date_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cafe_day_closes');

        if (Schema::hasTable('cafe_shifts')) {
            foreach ([
                'day_close_id', 'journal_entry_id', 'approval_note', 'approved_at', 'approved_by',
                'counted_at', 'counted_by', 'count_status',
            ] as $column) {
                if (Schema::hasColumn('cafe_shifts', $column)) {
                    Schema::table('cafe_shifts', function (Blueprint $table) use ($column) {
                        $table->dropColumn($column);
                    });
                }
            }
        }
    }
};
