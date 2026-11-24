<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recipes (bills of materials) and weighted-average stock costing.
 *
 * A cafe's menu price is a guess until somebody knows what the plate costs, and the plate cost
 * is the sum of its ingredients at what they were actually bought for. Nothing in this product
 * could answer "what does an espresso cost us?" — `products.purchase_price_minor` is a single
 * hand-typed number per item, with no link between a dish and the beans, milk and cup it
 * consumes.
 *
 * What this adds:
 *
 *  1. **`recipe_lines`** — one row per ingredient per dish (or per modifier option), with a
 *     quantity in the ingredient's own unit and a waste percentage. The same table serves
 *     dishes and add-ons, because "oat milk" is an ingredient whether it is in a latte or an
 *     extra.
 *  2. **`ingredient_costs`** — the running weighted-average cost per sellable/stock item.
 *     Weighted average, not last price: a shop that buys milk at two prices this week has one
 *     cost per litre, and a P&L built on the latest invoice alone jumps every time a delivery
 *     arrives.
 *  3. **`stock_movements`** — an append-only ledger of quantity in/out. Stock counts were
 *     previously a single mutable `quantity` column, so "where did the coffee go" had no
 *     answer. Movements also carry the unit cost at the time, which is what makes the
 *     weighted average auditable.
 *  4. **`order_item_ingredient_costs`** — the cost of a line frozen at sale time, so a later
 *     price change cannot restate last month's margin.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('ingredient_costs')) {
            Schema::create('ingredient_costs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                // The thing being costed: a menu product, or an inventory product in `acc_products`.
                // Kept as a polymorphic-ish pair rather than two nullable FKs so a report can
                // sum both sides without a UNION.
                $table->string('subject_type', 20); // product | acc_product
                $table->unsignedBigInteger('subject_id');
                // Weighted average, in minor units per unit of measure. Stored as a decimal
                // because a litre of milk at 65,000/12 is not an integer.
                $table->decimal('avg_cost_minor', 18, 6)->default(0);
                // What the last purchase cost — shown next to the average so a manager can see
                // which way a price is moving.
                $table->decimal('last_cost_minor', 18, 6)->default(0);
                $table->decimal('qty_on_hand', 16, 4)->default(0);
                $table->string('unit', 20)->nullable();
                $table->timestamp('last_purchase_at')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'subject_type', 'subject_id'], 'ingredient_costs_unique');
                $table->index(['tenant_id', 'subject_type'], 'ingredient_costs_type_idx');
            });
        }

        if (! Schema::hasTable('stock_movements')) {
            Schema::create('stock_movements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('subject_type', 20)->default('acc_product');
                $table->unsignedBigInteger('subject_id');
                // purchase | sale | waste | count | transfer_in | transfer_out | production
                $table->string('reason', 24);
                // Signed: positive in, negative out. One column because every report is a SUM.
                $table->decimal('quantity', 16, 4);
                $table->decimal('unit_cost_minor', 18, 6)->nullable();
                $table->decimal('value_minor', 18, 4)->nullable();
                $table->string('reference_type', 40)->nullable();
                $table->unsignedBigInteger('reference_id')->nullable();
                // Waste needs a reason ("expired", "dropped", "staff meal") or it is just
                // unexplained shrinkage with a label.
                $table->string('note', 255)->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('moved_at')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'subject_type', 'subject_id', 'moved_at'], 'stock_movements_subject_idx');
                $table->index(['tenant_id', 'reason'], 'stock_movements_reason_idx');
            });
        }

        if (! Schema::hasTable('recipe_lines')) {
            Schema::create('recipe_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                // What the recipe is *for*: a menu product, or a modifier option (an add-on
                // can consume stock too — an extra patty is inventory, not a price delta).
                $table->string('subject_type', 20); // product | modifier_option
                $table->unsignedBigInteger('subject_id');
                // What it consumes.
                $table->string('component_type', 20); // product | acc_product | modifier_option
                $table->unsignedBigInteger('component_id');
                // In the component's own unit. `yield_quantity` of the dish uses this much.
                $table->decimal('quantity', 16, 4)->default(1);
                // Trim, spillage, evaporation. A 3% waste on a milk pour is not pedantry; it
                // is the difference between a plate cost that reconciles and one that does not.
                $table->decimal('waste_percent', 6, 2)->default(0);
                $table->string('unit', 20)->nullable();
                $table->string('note', 191)->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();

                $table->index(['tenant_id', 'subject_type', 'subject_id'], 'recipe_lines_subject_idx');
                $table->unique(
                    ['tenant_id', 'subject_type', 'subject_id', 'component_type', 'component_id'],
                    'recipe_lines_unique_component',
                );
            });
        }

        // The cost of one dish, as it stood when it was sold.
        if (! Schema::hasTable('order_item_ingredient_costs') && Schema::hasTable('order_items')) {
            Schema::create('order_item_ingredient_costs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_item_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
                // Cost per single unit of the line, so quantity can change without restating it.
                $table->decimal('unit_cost_minor', 18, 4)->default(0);
                $table->decimal('quantity', 16, 4)->default(0);
                $table->decimal('total_cost_minor', 18, 4)->default(0);
                // False when some ingredient had no cost at all — the line is then a lower
                // bound, and a report must say so rather than quietly claiming a margin.
                $table->boolean('complete')->default(true);
                $table->json('breakdown')->nullable();
                $table->timestamps();

                $table->unique(['order_item_id'], 'order_item_ingredient_costs_unique');
                $table->index(['tenant_id', 'order_id'], 'order_item_ingredient_costs_order_idx');
            });
        }

        // Menu items need a cost basis of their own for dishes whose ingredients are not
        // tracked (a bought-in cake). Nullable: untracked stays untracked, never zero.
        if (Schema::hasTable('products') && ! Schema::hasColumn('products', 'cost_is_estimated')) {
            Schema::table('products', function (Blueprint $table) {
                // True when the cost is typed by hand rather than rolled up from a recipe.
                $table->boolean('cost_is_estimated')->default(false)->after('purchase_price_minor');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('products') && Schema::hasColumn('products', 'cost_is_estimated')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropColumn('cost_is_estimated');
            });
        }

        Schema::dropIfExists('order_item_ingredient_costs');
        Schema::dropIfExists('recipe_lines');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('ingredient_costs');
    }
};
