<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Account coding (chart-of-accounts mapping) + cost tracking for sales journals.
 *
 * Before this migration the sales journal hard-coded 1101/4101/2101 and posted every
 * tender — cash, card, terminal — to accounts receivable. There was no cost of goods
 * line at all. Two things therefore could not be answered from the ledger: "how much
 * cash came in today" and "what did we earn on what we sold".
 *
 * This migration adds the storage for both:
 *
 *  1. `accounting_account_coding` — one row per tenant mapping a logical role
 *     (sales, vat, cogs, cash, …) to a chart-of-accounts code. Kept as a real table
 *     rather than a JSON setting because it is the join between the ledger and the
 *     settings screen, and a missing/duplicate code must be a constraint, not a typo.
 *  2. `order_items.unit_cost_minor` — the purchase price captured at sale time. A cost
 *     read at posting time would restate old journals every time a supplier price
 *     changes; capture-at-sale keeps each journal true to the day it was posted.
 *  3. `order_items.modifier_delta_minor` — the add-on delta already folded into
 *     `unit_price_minor`, so COGS can be valued on the base product cost without
 *     losing the price the guest actually paid.
 *
 * Nothing here rewrites existing journals. Historic rows stay as posted; the new
 * mapping takes effect on the next amendment or first posting.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->accountCoding();
        $this->orderItemCosts();
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_account_coding');

        if (Schema::hasColumn('order_items', 'unit_cost_minor')) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->dropColumn('unit_cost_minor');
            });
        }
        if (Schema::hasColumn('order_items', 'modifier_delta_minor')) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->dropColumn('modifier_delta_minor');
            });
        }
    }

    /**
     * Role → account code, per tenant.
     *
     * `CASH_TENDER_CODES` is deliberately not modelled as columns; payment methods live in
     * the `match_value` column of a row whose role is `tender`. That keeps adding a tender
     * ("credit", "gift card") a data change rather than a migration.
     */
    private function accountCoding(): void
    {
        if (Schema::hasTable('accounting_account_coding')) {
            return;
        }

        Schema::create('accounting_account_coding', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('role', 32);
            // `match_value` is the tender key for role=tender rows, null otherwise.
            $table->string('match_value', 64)->nullable();
            $table->string('code', 32);
            $table->timestamps();

            $table->index(['tenant_id', 'role'], 'acc_coding_tenant_role');
            $table->unique(['tenant_id', 'role', 'match_value'], 'acc_coding_unique');
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
        });
    }

    /**
     * Cost of goods, captured per sold line.
     */
    private function orderItemCosts(): void
    {
        if (! Schema::hasColumn('order_items', 'unit_cost_minor')) {
            Schema::table('order_items', function (Blueprint $table): void {
                // Null means "cost unknown at the time of sale". The posting code treats a
                // null cost as reason to skip the COGS line rather than post a zero cost,
                // which would silently overstate margin.
                $table->unsignedBigInteger('unit_cost_minor')->nullable()->after('unit_price_minor');
            });
        }

        if (! Schema::hasColumn('order_items', 'modifier_delta_minor')) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->unsignedBigInteger('modifier_delta_minor')->default(0)->after('unit_cost_minor');
            });
        }

        // Backfill the modifier delta for lines that have add-ons, so a journal posted for an
        // existing counter sale values COGS on the base product rather than the add-on price.
        // `price_delta_minor` is per unit, so the line delta is delta × quantity.
        if (Schema::hasTable('order_item_modifiers')) {
            DB::statement(
                'UPDATE order_items SET modifier_delta_minor = ('
                .'  SELECT COALESCE(SUM(oim.price_delta_minor * oim.quantity), 0)'
                .'  FROM order_item_modifiers oim WHERE oim.order_item_id = order_items.id'
                .') WHERE modifier_delta_minor = 0'
            );
        }
    }
};
