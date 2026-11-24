<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Making something from something: a production run.
 *
 * A kitchen that bakes its own bread, or batches cold brew overnight, moves stock twice and
 * only ever recorded one side of it. The ingredients left the shelf (an issue), and the result
 * appeared from nowhere (a receipt with no counterpart). The value was right and the shelf was
 * wrong: the buns were never withdrawn, so the flour count drifted upward every week and the
 * plate cost was computed from ingredients that had not actually been consumed.
 *
 * A run is the pair, recorded together:
 *
 *   1. consume every component per the recipe — through `RecipeCosting`, so the weighted
 *      average is used and the movement carries its unit cost;
 *   2. receive the output into stock at **the value consumed**, not at a guessed price.
 *
 * That second point is the whole design. Costing the output at anything other than what the
 * inputs cost would create or destroy value on every bake; the ledger would stop balancing and
 * the bread's margin would move every time the flour price did.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('production_runs')) {
            Schema::create('production_runs', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                // The recipe's subject: what the run made. Usually an `acc_product` (a stocked
                // item like "خمیر نان"), because a finished menu dish is sold, not produced.
                $table->string('output_type', 20)->default('acc_product');
                $table->unsignedBigInteger('output_id');
                // How many units of output the recipe yields, and how many were actually made.
                // A run of 40 buns from a recipe yielding 40 is the normal case; a run of 37
                // because three burned is the reason these are two numbers and not one.
                $table->decimal('recipe_yield', 16, 4)->default(1);
                $table->decimal('produced_quantity', 16, 4);
                $table->foreignId('warehouse_id')->nullable()->constrained('acc_warehouses')->nullOnDelete();
                $table->string('batch_no', 64)->nullable();
                // Where the finished batch sits: the same shelf question as an arrival, asked
                // about something that did not arrive in a van.
                $table->string('slot', 64)->nullable();
                $table->date('expires_on')->nullable();
                // Frozen at completion: the sum of `consumed_value_minor` on the lines, plus
                // any labour/overhead the shop chose to add. Kept on the run so a later price
                // change cannot restate what this bake cost.
                $table->decimal('input_value_minor', 18, 4)->default(0);
                $table->decimal('output_unit_cost_minor', 18, 6)->default(0);
                // draft | completed | cancelled
                $table->string('status', 16)->default('draft');
                $table->string('note', 255)->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'status', 'completed_at'], 'production_runs_tenant_status_idx');
                $table->index(['tenant_id', 'output_type', 'output_id'], 'production_runs_output_idx');
            });
        }

        if (! Schema::hasTable('production_run_lines')) {
            Schema::create('production_run_lines', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('production_run_id')->constrained('production_runs')->cascadeOnDelete();
                $table->string('component_type', 20)->default('acc_product');
                $table->unsignedBigInteger('component_id');
                // Quantity actually consumed for this run — the recipe scaled to the run's
                // yield, waste included. Stored, not recomputed: the recipe may be edited
                // tomorrow and this run must still say what it ate.
                $table->decimal('quantity', 16, 4);
                $table->decimal('unit_cost_minor', 18, 6)->default(0);
                $table->decimal('consumed_value_minor', 18, 4)->default(0);
                $table->string('unit', 20)->nullable();
                // True when the component had no cost: the run still happened, and the value
                // is a floor, not a fact.
                $table->boolean('cost_known')->default(true);
                $table->timestamps();

                $table->index(['production_run_id'], 'production_run_lines_run_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('production_run_lines');
        Schema::dropIfExists('production_runs');
    }
};
