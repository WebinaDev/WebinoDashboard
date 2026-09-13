<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('tenant_id')->constrained('categories')->nullOnDelete();
            $table->unsignedBigInteger('thumbnail_id')->nullable()->after('cover_image_url');
            $table->unsignedInteger('views_count')->default(0)->after('thumbnail_id');
        });

        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->text('description')->nullable();
            $table->string('image_url')->nullable();
            $table->unsignedBigInteger('thumbnail_id')->nullable();
            $table->unsignedInteger('views_count')->default(0);
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('brand_product', function (Blueprint $table) {
            $table->id();
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unique(['brand_id', 'product_id']);
        });

        Schema::create('product_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('product_tag', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_tag_id')->constrained('product_tags')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unique(['product_tag_id', 'product_id']);
        });

        Schema::create('category_product', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unique(['category_id', 'product_id']);
        });

        Schema::create('product_attributes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->string('type')->default('select'); // select|color|image|button|text
            $table->string('order_by')->default('menu_order'); // menu_order|name|name_num|id
            $table->boolean('has_archives')->default(false);
            $table->boolean('show_swatch_label')->default(true);
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('product_attribute_terms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_attribute_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('menu_order')->default(0);
            $table->string('color', 32)->nullable();
            $table->string('image_url')->nullable();
            $table->timestamps();
            $table->unique(['product_attribute_id', 'slug'], 'attr_term_slug_unique');
        });

        Schema::create('attribute_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->json('attribute_ids')->nullable();
            $table->timestamps();
        });

        Schema::create('product_attribute_product', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_attribute_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_visible')->default(true);
            $table->boolean('is_variation')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->json('term_ids')->nullable();
            $table->json('custom_options')->nullable();
            $table->unique(['product_id', 'product_attribute_id'], 'product_attr_unique');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->string('status')->default('publish')->after('meta'); // publish|draft|trash
            $table->string('type')->default('simple')->after('status'); // simple|variable
            $table->string('catalog_visibility')->default('visible')->after('type'); // visible|catalog|search|hidden
            $table->string('stock_status')->default('instock')->after('catalog_visibility'); // instock|outofstock|onbackorder
            $table->boolean('manage_stock')->default(false)->after('stock_status');
            $table->decimal('weight', 12, 4)->nullable()->after('manage_stock');
            $table->decimal('length', 12, 4)->nullable()->after('weight');
            $table->decimal('width', 12, 4)->nullable()->after('length');
            $table->decimal('height', 12, 4)->nullable()->after('width');
            $table->json('gallery')->nullable()->after('height');
            $table->unsignedBigInteger('sale_price_minor')->nullable()->after('price_minor');
            $table->string('english_name')->nullable();
            $table->unsignedInteger('shipping_time')->nullable();
            $table->string('video_cover_url')->nullable();
            $table->json('labels')->nullable();
            $table->json('custom_labels')->nullable();
            $table->unsignedInteger('initial_stock_quantity')->nullable();
            $table->text('ai_review_summary')->nullable();
            $table->json('faqs')->nullable();
            $table->unsignedBigInteger('purchase_price_minor')->nullable();
            $table->boolean('lock_price')->default(false);
            $table->string('reference_url')->nullable();
            $table->string('reference_source')->nullable();
            $table->timestamp('reference_last_sync')->nullable();
            $table->json('wholesale_rule')->nullable();
            $table->json('platform_prices')->nullable();
            $table->unsignedInteger('views_count')->default(0);
            $table->text('short_description')->nullable();
            $table->json('related_ids')->nullable();
            $table->json('upsell_ids')->nullable();
            $table->json('cross_sell_ids')->nullable();
        });

        Schema::table('product_variants', function (Blueprint $table) {
            $table->string('sku')->nullable()->after('name');
            $table->unsignedInteger('stock')->nullable()->after('price_minor');
            $table->string('stock_status')->default('instock')->after('stock');
            $table->boolean('manage_stock')->default(false)->after('stock_status');
            $table->unsignedBigInteger('sale_price_minor')->nullable()->after('manage_stock');
            $table->unsignedBigInteger('purchase_price_minor')->nullable()->after('sale_price_minor');
            $table->boolean('lock_price')->default(false)->after('purchase_price_minor');
            $table->json('attribute_values')->nullable()->after('lock_price');
            $table->string('image_url')->nullable()->after('attribute_values');
            $table->decimal('weight', 12, 4)->nullable();
            $table->decimal('length', 12, 4)->nullable();
            $table->decimal('width', 12, 4)->nullable();
            $table->decimal('height', 12, 4)->nullable();
            $table->json('wholesale_rule')->nullable();
            $table->string('reference_url')->nullable();
            $table->json('platform_prices')->nullable();
        });

        Schema::create('marketplace_product_maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('platform'); // digikala|basalam|technolife|tapsishop|snappshop
            $table->string('remote_product_id')->nullable();
            $table->string('remote_variant_id')->nullable();
            $table->string('remote_url')->nullable();
            $table->boolean('sync_enabled')->default(false);
            $table->timestamp('last_sync_at')->nullable();
            $table->text('last_error')->nullable();
            $table->unsignedBigInteger('remote_price')->nullable();
            $table->integer('remote_stock')->nullable();
            $table->timestamps();
            $table->unique(['product_id', 'product_variant_id', 'platform'], 'marketplace_map_unique');
        });

        Schema::create('pricing_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id']);
        });

        Schema::create('bulk_price_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('pending'); // pending|running|done|cancelled|failed
            $table->json('params')->nullable();
            $table->json('state')->nullable();
            $table->text('last_log')->nullable();
            $table->boolean('locked')->default(false);
            $table->timestamps();
        });

        Schema::create('coffee_origins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->string('iso_code', 8)->nullable();
            $table->string('image_url')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('coffee_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->json('visible')->nullable();
            $table->unsignedTinyInteger('blend_robusta')->default(0);
            $table->unsignedTinyInteger('blend_arabica')->default(100);
            $table->json('acidity')->nullable();
            $table->unsignedInteger('caffeine_mg')->nullable();
            $table->unsignedTinyInteger('bitterness')->nullable();
            $table->unsignedTinyInteger('sweetness')->nullable();
            $table->unsignedTinyInteger('body')->nullable();
            $table->unsignedInteger('pack_weight_g')->nullable();
            $table->string('price_mode')->default('none');
            $table->json('price_parts')->nullable();
            $table->json('origin_ids')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->unique(['product_id']);
        });

        Schema::create('coffee_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('kind'); // profile|pricing|blend
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coffee_settings');
        Schema::dropIfExists('coffee_profiles');
        Schema::dropIfExists('coffee_origins');
        Schema::dropIfExists('bulk_price_jobs');
        Schema::dropIfExists('pricing_settings');
        Schema::dropIfExists('marketplace_product_maps');

        Schema::table('product_variants', function (Blueprint $table) {
            $table->dropColumn([
                'sku', 'stock', 'stock_status', 'manage_stock', 'sale_price_minor',
                'purchase_price_minor', 'lock_price', 'attribute_values', 'image_url',
                'weight', 'length', 'width', 'height', 'wholesale_rule', 'reference_url', 'platform_prices',
            ]);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn([
                'status', 'type', 'catalog_visibility', 'stock_status', 'manage_stock',
                'weight', 'length', 'width', 'height', 'gallery', 'sale_price_minor',
                'english_name', 'shipping_time', 'video_cover_url', 'labels', 'custom_labels',
                'initial_stock_quantity', 'ai_review_summary', 'faqs',
                'purchase_price_minor', 'lock_price', 'reference_url', 'reference_source',
                'reference_last_sync', 'wholesale_rule', 'platform_prices', 'views_count',
                'short_description', 'related_ids', 'upsell_ids', 'cross_sell_ids',
            ]);
        });

        Schema::dropIfExists('product_attribute_product');
        Schema::dropIfExists('attribute_groups');
        Schema::dropIfExists('product_attribute_terms');
        Schema::dropIfExists('product_attributes');
        Schema::dropIfExists('category_product');
        Schema::dropIfExists('product_tag');
        Schema::dropIfExists('product_tags');
        Schema::dropIfExists('brand_product');
        Schema::dropIfExists('brands');

        Schema::table('categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn(['thumbnail_id', 'views_count']);
        });
    }
};
