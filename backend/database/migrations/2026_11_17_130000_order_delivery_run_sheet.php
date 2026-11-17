<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Courier run sheet.
 *
 * Delivery state lives in real columns rather than order meta: the driver board filters and
 * sorts on it constantly, and a JSON path cannot be indexed or counted cheaply.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table) {
                if (! Schema::hasColumn('orders', 'delivery_status')) {
                    // queued -> claimed -> picked_up -> delivered | failed
                    $table->string('delivery_status', 24)->nullable()->index();
                }
                if (! Schema::hasColumn('orders', 'delivery_driver_id')) {
                    $table->unsignedBigInteger('delivery_driver_id')->nullable()->index();
                }
                if (! Schema::hasColumn('orders', 'delivery_claimed_at')) {
                    $table->timestamp('delivery_claimed_at')->nullable();
                }
                if (! Schema::hasColumn('orders', 'delivery_picked_up_at')) {
                    $table->timestamp('delivery_picked_up_at')->nullable();
                }
                if (! Schema::hasColumn('orders', 'delivery_completed_at')) {
                    $table->timestamp('delivery_completed_at')->nullable();
                }
                if (! Schema::hasColumn('orders', 'delivery_failure_reason')) {
                    $table->string('delivery_failure_reason', 255)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('orders')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            foreach ([
                'delivery_status',
                'delivery_driver_id',
                'delivery_claimed_at',
                'delivery_picked_up_at',
                'delivery_completed_at',
                'delivery_failure_reason',
            ] as $column) {
                if (Schema::hasColumn('orders', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
