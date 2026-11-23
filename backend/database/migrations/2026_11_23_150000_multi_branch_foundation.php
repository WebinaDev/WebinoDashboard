<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-branch foundation (requirement #1).
 *
 * Decisions this encodes (made by the shop owner, not inferred):
 *  - catalogue and prices are SHARED across branches; a branch may override a price and
 *    may hide an item without touching any other branch (`branch_product_prices`);
 *  - stock is PER BRANCH, held in `branch_stock` — the `products.stock` /
 *    `product_variants.stock` columns stay as the tenant-wide figure that existing
 *    reports and the marketplace sync read;
 *  - a sale that would drive a branch negative is still recorded (money was taken and the
 *    guest has left), and flagged for review rather than refused.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->addOrdersBranch();
        $this->createBranchProductPrices();
        $this->createBranchStock();
        $this->createKitchenStations();
        $this->backfillBranchStock();
        $this->backfillOrderBranches();
    }

    public function down(): void
    {
        $this->dropKitchenStations();

        Schema::dropIfExists('branch_stock');

        Schema::dropIfExists('branch_product_prices');

        Schema::table('orders', function (Blueprint $table): void {
            foreach (['branch_id', 'stock_oversold_at'] as $column) {
                if (Schema::hasColumn('orders', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    /** Orders belong to the branch that rang them up; null keeps pre-existing rows honest. */
    private function addOrdersBranch(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (! Schema::hasColumn('orders', 'branch_id')) {
                $table->foreignId('branch_id')->nullable()->after('tenant_id')
                    ->constrained('cafe_branches')->nullOnDelete();
            }
            if (! Schema::hasColumn('orders', 'stock_oversold_at')) {
                // Set when an offline sale drove a branch negative. The sale is kept; this
                // column is what makes the shortfall findable instead of invisible.
                $table->timestamp('stock_oversold_at')->nullable()->after('branch_id');
            }
        });

        $indexes = array_map(fn ($index) => $index['name'] ?? '', Schema::getIndexes('orders'));
        if (! in_array('orders_tenant_branch_created_index', $indexes, true)) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->index(['tenant_id', 'branch_id', 'created_at'], 'orders_tenant_branch_created_index');
            });
        }
    }

    /** Per-branch price override and availability, without forking the catalogue. */
    private function createBranchProductPrices(): void
    {
        if (Schema::hasTable('branch_product_prices')) {
            return;
        }

        Schema::create('branch_product_prices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('cafe_branches')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->cascadeOnDelete();
            // Null means "use the product's own price"; a value is this branch's price.
            $table->unsignedBigInteger('price_minor')->nullable();
            $table->unsignedBigInteger('sale_price_minor')->nullable();
            // A branch can 86 an item without deleting it from the shared catalogue.
            $table->boolean('is_available')->default(true);
            $table->timestamps();

            $table->unique(
                ['branch_id', 'product_id', 'product_variant_id'],
                'branch_product_price_unique'
            );
            $table->index(['tenant_id', 'branch_id'], 'branch_product_price_tenant_branch_index');
        });
    }

    /** The stock ledger a branch actually sells against. */
    private function createBranchStock(): void
    {
        if (Schema::hasTable('branch_stock')) {
            return;
        }

        Schema::create('branch_stock', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('cafe_branches')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->cascadeOnDelete();
            // Signed on purpose: an offline sale may leave this negative, and hiding that
            // with an unsigned column would silently lose the shortfall.
            $table->integer('quantity')->default(0);
            $table->integer('reserved_quantity')->default(0);
            $table->unsignedInteger('reorder_level')->nullable();
            $table->timestamp('last_counted_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['branch_id', 'product_id', 'product_variant_id'],
                'branch_stock_unique'
            );
            $table->index(['tenant_id', 'branch_id'], 'branch_stock_tenant_branch_index');
            $table->index(['branch_id', 'quantity'], 'branch_stock_low_index');
        });
    }

    /** Kitchen stations, so a cook sees only their own board. */
    private function createKitchenStations(): void
    {
        if (! Schema::hasTable('cafe_kitchen_stations')) {
            Schema::create('cafe_kitchen_stations', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                $table->string('name_fa');
                $table->string('name_en')->nullable();
                $table->string('slug', 64);
                $table->string('kind', 24)->default('kitchen'); // kitchen | bar | dessert | pass
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();

                $table->unique(['tenant_id', 'slug'], 'cafe_kitchen_station_unique');
            });
        }

        // Which station prepares which item. A product with no row goes to the default board.
        if (! Schema::hasTable('cafe_station_products')) {
            Schema::create('cafe_station_products', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('station_id')->constrained('cafe_kitchen_stations')->cascadeOnDelete();
                // Exactly one of these is set: a single item, or a whole category.
                $table->foreignId('product_id')->nullable()->constrained()->cascadeOnDelete();
                $table->foreignId('category_id')->nullable()->constrained()->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['station_id', 'product_id'], 'cafe_station_product_unique');
                $table->unique(['station_id', 'category_id'], 'cafe_station_category_unique');
            });
        }

        // A cook is assigned to stations; the KDS filters by this membership.
        if (! Schema::hasTable('cafe_station_users')) {
            Schema::create('cafe_station_users', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('station_id')->constrained('cafe_kitchen_stations')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['station_id', 'user_id'], 'cafe_station_user_unique');
                $table->index(['tenant_id', 'user_id'], 'cafe_station_user_tenant_index');
            });
        }
    }

    /**
     * Seed every existing branch with the tenant-wide stock figure.
     *
     * Without this a branch would read as zero stock for everything the moment the new
     * code ships. The single-branch case (the common one) is therefore a no-op in
     * behaviour: one branch, quantity equal to the old column.
     */
    private function backfillBranchStock(): void
    {
        if (! Schema::hasTable('branch_stock') || ! Schema::hasTable('cafe_branches')) {
            return;
        }

        $branchIds = DB::table('cafe_branches')->distinct()->pluck('tenant_id', 'id');

        if ($branchIds->isEmpty()) {
            return;
        }

        $now = now();

        // Products.
        DB::table('products')
            ->select(['id', 'tenant_id', 'stock'])
            ->orderBy('id')
            ->chunk(500, function ($products) use ($branchIds, $now): void {
                $rows = [];
                foreach ($products as $product) {
                    foreach ($branchIds as $branchId => $tenantId) {
                        if ((int) $tenantId !== (int) $product->tenant_id) {
                            continue;
                        }
                        $rows[] = [
                            'tenant_id' => $product->tenant_id,
                            'branch_id' => $branchId,
                            'product_id' => $product->id,
                            'product_variant_id' => null,
                            'quantity' => (int) ($product->stock ?? 0),
                            'reserved_quantity' => 0,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }
                foreach (array_chunk($rows, 400) as $chunk) {
                    DB::table('branch_stock')->insertOrIgnore($chunk);
                }
            });

        // Variants that track their own stock.
        if (! Schema::hasTable('product_variants')) {
            return;
        }

        DB::table('product_variants')
            ->select(['id', 'tenant_id', 'product_id', 'stock', 'manage_stock'])
            ->where(function ($q): void {
                $q->where('manage_stock', true)->orWhereNotNull('stock');
            })
            ->orderBy('id')
            ->chunk(500, function ($variants) use ($branchIds, $now): void {
                $rows = [];
                foreach ($variants as $variant) {
                    foreach ($branchIds as $branchId => $tenantId) {
                        if ((int) $tenantId !== (int) $variant->tenant_id) {
                            continue;
                        }
                        $rows[] = [
                            'tenant_id' => $variant->tenant_id,
                            'branch_id' => $branchId,
                            'product_id' => $variant->product_id,
                            'product_variant_id' => $variant->id,
                            'quantity' => (int) ($variant->stock ?? 0),
                            'reserved_quantity' => 0,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }
                foreach (array_chunk($rows, 400) as $chunk) {
                    DB::table('branch_stock')->insertOrIgnore($chunk);
                }
            });
    }

    /**
     * Point existing orders at a branch where that is unambiguous.
     *
     * A shift already knows its branch, so POS orders can be attributed through the cashier
     * on duty. Anything ambiguous stays null rather than being guessed.
     */
    private function backfillOrderBranches(): void
    {
        if (! Schema::hasColumn('orders', 'branch_id') || ! Schema::hasTable('cafe_shifts')) {
            return;
        }

        $shifts = DB::table('cafe_shifts')
            ->whereNotNull('branch_id')
            ->whereNotNull('user_id')
            ->get(['branch_id', 'user_id', 'opened_at', 'closed_at']);

        foreach ($shifts as $shift) {
            $query = DB::table('orders')
                ->whereNull('branch_id')
                ->where('created_by', $shift->user_id)
                ->where('created_at', '>=', $shift->opened_at);

            if ($shift->closed_at !== null) {
                $query->where('created_at', '<=', $shift->closed_at);
            }

            $query->update(['branch_id' => $shift->branch_id]);
        }
    }

    private function dropKitchenStations(): void
    {
        Schema::dropIfExists('cafe_station_users');
        Schema::dropIfExists('cafe_station_products');
        Schema::dropIfExists('cafe_kitchen_stations');
    }
};
