<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Daily operations foundation (requirement #3).
 *
 * This migration is the schema the seven workbench features share, so the feature PRs that
 * follow do not each invent their own table:
 *
 *  1. Workbench        — no table; the queue is derived from orders (see WorkbenchService).
 *  2. New order        — `order_item_modifiers` (add-ons per line), `order_payments`
 *                        (several tenders on one sale).
 *  3. Settle / void    — `order_status_log` (who moved what, when, and why).
 *  4. KDS              — `cafe_kitchen_station_columns` (configurable columns),
 *                        `cafe_order_item_prep` (per-item prep ticks).
 *  5. Delivery         — `cafe_delivery_zones` (fee + minimum per area).
 *  6. Reservation      — `reservations` extended with seating/attendance fields.
 *  7. Paid edit        — `order_amendments` (window, delta, full history, manager approval).
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->orderPaidAt();
        $this->orderItemModifiers();
        $this->orderPayments();
        $this->orderStatusLog();
        $this->kdsConfiguration();
        $this->deliveryZones();
        $this->reservationLifecycle();
        $this->orderAmendments();
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (Schema::hasColumn('orders', 'paid_at')) {
                $table->dropColumn('paid_at');
            }
        });

        Schema::dropIfExists('order_amendments');
        Schema::dropIfExists('cafe_delivery_zones');
        Schema::dropIfExists('cafe_order_item_prep');
        Schema::dropIfExists('cafe_kitchen_station_columns');
        Schema::dropIfExists('order_status_log');
        Schema::dropIfExists('order_payments');
        Schema::dropIfExists('order_item_modifiers');
    }

    /**
     * When the money actually arrived.
     *
     * The paid-edit window is measured from payment, and `updated_at` is useless for that:
     * any later touch — a kitchen tick, a note — would silently reopen the window. Backfilled
     * from the last update for existing paid rows, which is the closest honest estimate.
     */
    private function orderPaidAt(): void
    {
        if (! Schema::hasColumn('orders', 'paid_at')) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->timestamp('paid_at')->nullable()->after('amount_paid_minor');
            });

            DB::table('orders')
                ->whereNull('paid_at')
                ->whereIn('status', ['paid', 'processing', 'completed', 'shipped'])
                ->update(['paid_at' => DB::raw('updated_at')]);
        }
    }

    /** Add-ons chosen per line: "latte + oat milk + extra shot". */
    private function orderItemModifiers(): void
    {
        if (Schema::hasTable('order_item_modifiers')) {
            return;
        }

        Schema::create('order_item_modifiers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('modifier_option_id')->nullable()->constrained('product_modifier_options')->nullOnDelete();
            // Frozen so a later menu edit cannot rewrite what the guest was charged.
            $table->string('name');
            $table->bigInteger('price_delta_minor')->default(0);
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();

            $table->index('order_item_id', 'order_item_modifier_item_index');
        });
    }

    /**
     * Several tenders on one sale: 300k cash + 195k card.
     *
     * A single `orders.payment_tender` column cannot express that, and the drawer
     * reconciliation in CafeShiftService reads cash separately from card.
     */
    private function orderPayments(): void
    {
        if (Schema::hasTable('order_payments')) {
            return;
        }

        Schema::create('order_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
            // cash | card_to_card | pos_terminal | online | wallet | other
            $table->string('tender', 32);
            $table->unsignedBigInteger('amount_minor');
            // What the guest handed over, for change calculation. Null for non-cash.
            $table->unsignedBigInteger('received_minor')->nullable();
            $table->unsignedBigInteger('change_minor')->nullable();
            $table->string('reference', 120)->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['order_id', 'tender'], 'order_payment_order_tender_index');
            $table->index(['tenant_id', 'branch_id', 'created_at'], 'order_payment_branch_time_index');
        });
    }

    /** Every status move, with the reason — the audit trail the settle and void dialogs need. */
    private function orderStatusLog(): void
    {
        if (Schema::hasTable('order_status_log')) {
            return;
        }

        Schema::create('order_status_log', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 48)->nullable();
            $table->string('to_status', 48);
            $table->string('reason', 500)->nullable();
            $table->string('reason_code', 48)->nullable(); // cancelled_by_guest | kitchen_error | …
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'created_at'], 'order_status_log_order_index');
            $table->index(['tenant_id', 'created_at'], 'order_status_log_tenant_index');
        });
    }

    /** Per-station column names, so a bar board and a pass can use different wording. */
    private function kdsConfiguration(): void
    {
        if (! Schema::hasTable('cafe_kitchen_station_columns')) {
            Schema::create('cafe_kitchen_station_columns', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('station_id')->nullable()->constrained('cafe_kitchen_stations')->cascadeOnDelete();
                $table->string('key', 48);        // new | preparing | ready | served
                $table->string('label_fa');
                $table->string('label_en')->nullable();
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->unique(['tenant_id', 'station_id', 'key'], 'kds_column_unique');
            });

            // Default columns, so a new station has a usable board without configuration.
            $now = now();
            $defaults = [
                ['new', 'جدید', 'New', 0],
                ['preparing', 'در حال آماده‌سازی', 'Preparing', 1],
                ['ready', 'آماده', 'Ready', 2],
                ['served', 'تحویل‌شده', 'Served', 3],
            ];
            foreach (DB::table('tenants')->pluck('id') as $tenantId) {
                foreach ($defaults as [$key, $fa, $en, $order]) {
                    DB::table('cafe_kitchen_station_columns')->insert([
                        'tenant_id' => $tenantId,
                        'station_id' => null,
                        'key' => $key,
                        'label_fa' => $fa,
                        'label_en' => $en,
                        'sort_order' => $order,
                        'is_active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        // Per-line prep state, so a cook can tick one dish without moving the whole ticket.
        if (! Schema::hasTable('cafe_order_item_prep')) {
            Schema::create('cafe_order_item_prep', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_item_id')->constrained()->cascadeOnDelete();
                $table->foreignId('station_id')->nullable()->constrained('cafe_kitchen_stations')->nullOnDelete();
                // new | preparing | ready | served
                $table->string('status', 24)->default('new');
                $table->foreignId('marked_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('marked_at')->nullable();
                $table->timestamps();

                $table->unique(['order_item_id', 'station_id'], 'cafe_item_prep_unique');
                $table->index(['order_id', 'status'], 'cafe_item_prep_order_status_index');
            });
        }
    }

    /** Delivery fee and minimum order per area. */
    private function deliveryZones(): void
    {
        if (Schema::hasTable('cafe_delivery_zones')) {
            return;
        }

        Schema::create('cafe_delivery_zones', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
            $table->string('name_fa');
            $table->string('name_en')->nullable();
            // Free-text area list; matching is done in the service (street/district names).
            $table->json('areas')->nullable();
            $table->unsignedBigInteger('delivery_fee_minor')->default(0);
            $table->unsignedBigInteger('minimum_order_minor')->default(0);
            // ETA the guest sees, and the radius used to estimate the courier run.
            $table->unsignedSmallInteger('eta_minutes')->nullable();
            $table->unsignedSmallInteger('radius_km')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'branch_id'], 'cafe_delivery_zone_index');
        });
    }

    /** Reservation confirmation, seating, and attendance — the call-in booking flow. */
    private function reservationLifecycle(): void
    {
        if (! Schema::hasTable('reservations')) {
            return;
        }

        $columns = array_flip(Schema::getColumnListing('reservations'));

        Schema::table('reservations', function (Blueprint $table) use ($columns): void {
            if (! isset($columns['confirmed_at'])) {
                $table->timestamp('confirmed_at')->nullable()->after('status');
            }
            if (! isset($columns['declined_at'])) {
                $table->timestamp('declined_at')->nullable()->after('confirmed_at');
            }
            if (! isset($columns['decline_reason'])) {
                $table->string('decline_reason', 300)->nullable()->after('declined_at');
            }
            if (! isset($columns['table_id'])) {
                $table->foreignId('table_id')->nullable()->after('branch_id')
                    ->constrained('cafe_tables')->nullOnDelete();
            }
            if (! isset($columns['seated_at'])) {
                $table->timestamp('seated_at')->nullable()->after('decline_reason');
            }
            if (! isset($columns['no_show_at'])) {
                $table->timestamp('no_show_at')->nullable()->after('seated_at');
            }
            if (! isset($columns['source'])) {
                // online | phone | walk_in
                $table->string('source', 24)->default('online')->after('party_size');
            }
        });
    }

    /**
     * Editing a paid invoice, with a window, a signed delta, and an approval trail.
     *
     * The order is never rewritten in place: an amendment records what changed and the
     * money that has to move (collect or refund), so the original receipt stays verifiable.
     */
    private function orderAmendments(): void
    {
        if (Schema::hasTable('order_amendments')) {
            return;
        }

        Schema::create('order_amendments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // total delta in minor units: positive = guest owes more, negative = refund due
            $table->bigInteger('delta_minor');
            $table->string('reason', 500);
            // pending | approved | rejected | settled
            $table->string('status', 24)->default('pending');
            $table->json('changes')->nullable();  // field => {before, after}
            $table->json('snapshot_before')->nullable();  // totals at the time of the edit
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('requested_by_name')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('approved_by_name')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            // How the difference was actually collected or returned.
            $table->string('settlement_tender', 32)->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'created_at'], 'order_amendment_order_index');
            $table->index(['tenant_id', 'status'], 'order_amendment_status_index');
        });
    }
};
