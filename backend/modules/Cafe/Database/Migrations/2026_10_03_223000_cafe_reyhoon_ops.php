<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            if (! Schema::hasColumn('cart_items', 'meta')) {
                $table->json('meta')->nullable();
            }
            if (! Schema::hasColumn('cart_items', 'line_key')) {
                $table->string('line_key', 40)->default('base');
            }
        });

        $indexNames = array_map(
            fn ($index) => $index['name'] ?? '',
            Schema::getIndexes('cart_items')
        );
        Schema::table('cart_items', function (Blueprint $table) use ($indexNames) {
            if (in_array('cart_items_cart_id_product_id_unique', $indexNames, true)) {
                $table->dropUnique('cart_items_cart_id_product_id_unique');
            }
            if (! in_array('cart_items_line_unique', $indexNames, true)) {
                $table->unique(['cart_id', 'product_id', 'line_key'], 'cart_items_line_unique');
            }
        });

        if (! Schema::hasTable('cafe_tables')) {
            Schema::create('cafe_tables', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                $table->string('code', 32);
                $table->string('label')->nullable();
                $table->unsignedTinyInteger('seats')->default(4);
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
                $table->unique(['tenant_id', 'code']);
            });
        }

        Schema::table('menus', function (Blueprint $table) {
            if (! Schema::hasColumn('menus', 'description')) {
                $table->text('description')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cafe_tables');

        Schema::table('menus', function (Blueprint $table) {
            if (Schema::hasColumn('menus', 'description')) {
                $table->dropColumn('description');
            }
        });

        Schema::table('cart_items', function (Blueprint $table) {
            $names = array_map(fn ($index) => $index['name'] ?? '', Schema::getIndexes('cart_items'));
            if (in_array('cart_items_line_unique', $names, true)) {
                $table->dropUnique('cart_items_line_unique');
            }
            if (! in_array('cart_items_cart_id_product_id_unique', $names, true)) {
                $table->unique(['cart_id', 'product_id']);
            }
            if (Schema::hasColumn('cart_items', 'line_key')) {
                $table->dropColumn('line_key');
            }
            if (Schema::hasColumn('cart_items', 'meta')) {
                $table->dropColumn('meta');
            }
        });
    }
};
