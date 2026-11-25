<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The oven, the espresso machine, the fit-out.
 *
 * A café spends more on equipment than on almost anything else, and it was invisible in the
 * books: a 400-million machine either vanished as one month's expense or never got recorded at
 * all. Neither answer survives an accountant looking at the P&L.
 *
 * Straight-line depreciation is the only method here on purpose. It is what a small shop's
 * accountant actually files, and a declining-balance option nobody uses correctly is a way to
 * produce wrong numbers with more keystrokes.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('acc_fixed_assets')) {
            return;
        }

        Schema::create('acc_fixed_assets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('category', 60)->nullable();
            $table->string('serial_no', 100)->nullable();
            $table->date('acquired_on');
            $table->decimal('cost_minor', 18, 2)->default(0);
            // What the shop expects to get for it at the end; the depreciable base is cost − this.
            $table->decimal('salvage_minor', 18, 2)->default(0);
            $table->unsignedInteger('useful_life_months')->default(60);
            $table->decimal('accumulated_minor', 18, 2)->default(0);
            $table->date('depreciated_through')->nullable();
            $table->string('status', 20)->default('active');
            $table->date('disposed_on')->nullable();
            $table->decimal('disposal_proceeds_minor', 18, 2)->default(0);
            $table->string('asset_account_code', 20)->default('1201');
            $table->string('accumulated_account_code', 20)->default('1209');
            $table->string('expense_account_code', 20)->default('6108');
            $table->foreignId('journal_entry_id')->nullable()->constrained('acc_journal_entries')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status'], 'fixed_asset_status_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_fixed_assets');
    }
};
