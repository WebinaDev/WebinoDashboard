<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Breakfast until eleven, the plates from twelve, cake all day.
 *
 * One menu, three services. Without this the till offers soup at eight in the morning and the
 * guest is told no, which is indistinguishable from the menu being wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('cafe_serving_windows')) {
            return;
        }

        Schema::create('cafe_serving_windows', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('label')->nullable();
            // Either a product or a category, never both: precedence must be unambiguous.
            $table->foreignId('product_id')->nullable()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('category_id')->nullable();
            $table->json('weekdays')->nullable();
            $table->time('start_time');
            $table->time('end_time');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['tenant_id', 'product_id'], 'serving_window_product_index');
            $table->index(['tenant_id', 'category_id'], 'serving_window_category_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cafe_serving_windows');
    }
};
