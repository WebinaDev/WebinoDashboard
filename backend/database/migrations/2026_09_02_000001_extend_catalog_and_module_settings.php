<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->string('description')->nullable()->after('slug');
            $table->string('icon_url')->nullable()->after('description');
            $table->string('image_url')->nullable()->after('icon_url');
            $table->unsignedSmallInteger('sort_order')->default(0)->after('image_url');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->string('slug')->nullable()->after('name');
            $table->text('description')->nullable()->after('slug');
            $table->string('image_url')->nullable()->after('description');
            $table->boolean('is_available')->default(true)->after('stock');
            $table->boolean('is_hidden')->default(false)->after('is_available');
            $table->boolean('is_new')->default(false)->after('is_hidden');
            $table->unsignedSmallInteger('sort_order')->default(0)->after('is_new');
            $table->unsignedTinyInteger('discount_percent')->default(0)->after('sort_order');
            $table->json('meta')->nullable()->after('discount_percent');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedBigInteger('price_minor')->default(0);
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('module_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('module_slug');
            $table->string('submodule_slug');
            $table->json('payload');
            $table->timestamps();
            $table->unique(['tenant_id', 'module_slug', 'submodule_slug'], 'module_settings_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('module_settings');
        Schema::dropIfExists('product_variants');
        Schema::table('products', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'slug']);
            $table->dropColumn([
                'slug', 'description', 'image_url', 'is_available', 'is_hidden',
                'is_new', 'sort_order', 'discount_percent', 'meta',
            ]);
        });
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn(['description', 'icon_url', 'image_url', 'sort_order']);
        });
    }
};
