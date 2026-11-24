<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One stock ledger, with warehouses, lots and expiry.
 *
 * The product had **two** stock tables that disagreed: `stock_movements` (written by recipe
 * costing, with weighted-average value and reasons) and `acc_warehouse_stock` (a bare
 * quantity, written by the accounting warehouse screens). A shop that received goods through
 * one screen found its stock unchanged on the other, and neither could tell you which lot a
 * carton came from or when it expires.
 *
 * `stock_movements` is made the ledger of record — it is append-only, signed, and already the
 * thing every cost calculation reads. `acc_warehouse_stock` survives as a **derived cache**
 * recalculated from the ledger after each movement, so the accounting module's screens keep
 * working without becoming a second truth.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->warehouseOnMovements();
        $this->batches();
        $this->unitsOnProducts();
        $this->purchasing();
    }

    /** Which store a movement happened in. Null means "the tenant's only store". */
    private function warehouseOnMovements(): void
    {
        if (! Schema::hasTable('stock_movements')) {
            return;
        }

        Schema::table('stock_movements', function (Blueprint $table): void {
            if (! Schema::hasColumn('stock_movements', 'warehouse_id')) {
                $table->foreignId('warehouse_id')->nullable()->after('subject_id')
                    ->constrained('acc_warehouses')->nullOnDelete();
            }
            if (! Schema::hasColumn('stock_movements', 'batch_id')) {
                $table->unsignedBigInteger('batch_id')->nullable()->after('warehouse_id');
            }
            // transfer | production join purchase/sale/waste/count as movement reasons.
            if (! Schema::hasColumn('stock_movements', 'counterpart_warehouse_id')) {
                $table->unsignedBigInteger('counterpart_warehouse_id')->nullable()->after('batch_id');
            }
        });
    }

    /**
     * Lots.
     *
     * A carton of milk is not interchangeable with the one behind it: one expires on Tuesday
     * and the other on Friday. Without a lot, "what expires this week" is unanswerable and
     * waste is always discovered after the fact.
     */
    private function batches(): void
    {
        if (Schema::hasTable('stock_batches')) {
            return;
        }

        Schema::create('stock_batches', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('acc_warehouses')->nullOnDelete();
            $table->string('subject_type', 20)->default('acc_product');
            $table->unsignedBigInteger('subject_id');
            $table->string('batch_no', 64)->nullable();
            // Where in the store it physically sits, so a picker can find it.
            $table->string('slot', 64)->nullable();
            $table->date('expires_on')->nullable();
            $table->decimal('quantity', 16, 4)->default(0);
            $table->decimal('unit_cost_minor', 18, 6)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'expires_on'], 'stock_batches_expiry_idx');
            $table->index(['tenant_id', 'subject_type', 'subject_id'], 'stock_batches_subject_idx');
        });
    }

    /** Base unit, purchase unit, and how many base units one purchase unit is. */
    private function unitsOnProducts(): void
    {
        if (! Schema::hasTable('acc_products')) {
            return;
        }

        Schema::table('acc_products', function (Blueprint $table): void {
            if (! Schema::hasColumn('acc_products', 'base_unit')) {
                // What recipes consume in: gram, millilitre, piece.
                $table->string('base_unit', 20)->nullable()->after('unit');
            }
            if (! Schema::hasColumn('acc_products', 'purchase_unit')) {
                // What the supplier sells: box, carton, kilo.
                $table->string('purchase_unit', 20)->nullable()->after('base_unit');
            }
            if (! Schema::hasColumn('acc_products', 'pack_size')) {
                // How many base units are in one purchase unit: a 12 kg carton is 12.
                $table->decimal('pack_size', 16, 4)->default(1)->after('purchase_unit');
            }
        });
    }

    /**
     * The buying path: request → approval → order → goods receipt with QC.
     *
     * None of it existed. A shop could record that stock appeared, but not that somebody had
     * asked for it, who approved the spend, or whether what arrived was the right thing.
     */
    private function purchasing(): void
    {
        if (! Schema::hasTable('purchase_requests')) {
            Schema::create('purchase_requests', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('warehouse_id')->nullable()->constrained('acc_warehouses')->nullOnDelete();
                $table->string('number', 50)->nullable();
                // draft | submitted | approved | rejected | ordered | cancelled
                $table->string('status', 24)->default('draft');
                $table->date('needed_by')->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('decided_at')->nullable();
                $table->string('decision_note', 500)->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'status'], 'purchase_requests_status_idx');
            });
        }

        if (! Schema::hasTable('purchase_request_items')) {
            Schema::create('purchase_request_items', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('request_id')->constrained('purchase_requests')->cascadeOnDelete();
                $table->foreignId('product_id')->constrained('acc_products')->cascadeOnDelete();
                $table->decimal('quantity', 16, 4);
                $table->string('unit', 20)->nullable();
                $table->decimal('estimated_unit_cost_minor', 18, 4)->nullable();
                $table->string('note', 191)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('purchase_orders')) {
            Schema::create('purchase_orders', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('request_id')->nullable()->constrained('purchase_requests')->nullOnDelete();
                $table->foreignId('supplier_id')->nullable()->constrained('acc_persons')->nullOnDelete();
                $table->foreignId('warehouse_id')->nullable()->constrained('acc_warehouses')->nullOnDelete();
                $table->string('number', 50)->nullable();
                // draft | sent | partially_received | received | cancelled
                $table->string('status', 24)->default('draft');
                $table->date('ordered_on')->nullable();
                $table->date('expected_on')->nullable();
                $table->decimal('total_minor', 18, 4)->default(0);
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['tenant_id', 'status'], 'purchase_orders_status_idx');
            });
        }

        if (! Schema::hasTable('purchase_order_items')) {
            Schema::create('purchase_order_items', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_id')->constrained('purchase_orders')->cascadeOnDelete();
                $table->foreignId('product_id')->constrained('acc_products')->cascadeOnDelete();
                $table->decimal('quantity', 16, 4);
                $table->decimal('received_quantity', 16, 4)->default(0);
                $table->decimal('unit_cost_minor', 18, 4)->default(0);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('purchase_receipts')) {
            Schema::create('purchase_receipts', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_id')->constrained('purchase_orders')->cascadeOnDelete();
                $table->string('number', 50)->nullable();
                $table->date('received_on')->nullable();
                // pending | passed | rejected — a receipt nobody inspected is not a receipt.
                $table->string('qc_status', 20)->default('pending');
                $table->string('qc_note', 500)->nullable();
                $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('purchase_receipt_items')) {
            Schema::create('purchase_receipt_items', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('receipt_id')->constrained('purchase_receipts')->cascadeOnDelete();
                $table->foreignId('order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();
                $table->foreignId('product_id')->constrained('acc_products')->cascadeOnDelete();
                $table->decimal('quantity', 16, 4);
                $table->decimal('unit_cost_minor', 18, 4)->default(0);
                $table->string('batch_no', 64)->nullable();
                $table->date('expires_on')->nullable();
                $table->string('slot', 64)->nullable();
                // Anything short of what was ordered has to be named, or the order stays open
                // forever and nobody knows why.
                $table->string('note', 191)->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        foreach (['purchase_receipt_items', 'purchase_receipts', 'purchase_order_items', 'purchase_orders', 'purchase_request_items', 'purchase_requests', 'stock_batches'] as $table) {
            Schema::dropIfExists($table);
        }

        if (Schema::hasTable('stock_movements')) {
            Schema::table('stock_movements', function (Blueprint $table): void {
                foreach (['counterpart_warehouse_id', 'batch_id', 'warehouse_id'] as $column) {
                    if (Schema::hasColumn('stock_movements', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (Schema::hasTable('acc_products')) {
            Schema::table('acc_products', function (Blueprint $table): void {
                foreach (['pack_size', 'purchase_unit', 'base_unit'] as $column) {
                    if (Schema::hasColumn('acc_products', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
