<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->string('display_mode')->default('grid')->after('sort_order');
            $table->string('cover_image_url')->nullable()->after('display_mode');
        });

        Schema::create('menus', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->string('menu_type')->default('cafe');
            $table->string('locale', 8)->nullable();
            $table->json('schedule')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('menu_id')->nullable()->after('category_id')->constrained('menus')->nullOnDelete();
            $table->boolean('is_featured')->default(false)->after('is_new');
            $table->boolean('is_sold_out')->default(false)->after('is_featured');
            $table->unsignedSmallInteger('calories')->nullable()->after('is_sold_out');
            $table->unsignedTinyInteger('spice_level')->default(0)->after('calories');
            $table->string('cover_image_url')->nullable()->after('image_url');
            $table->string('video_url')->nullable()->after('cover_image_url');
        });

        Schema::create('product_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('image');
            $table->string('url');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_cover')->default(false);
            $table->timestamps();
        });

        Schema::create('allergens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('slug');
            $table->string('name_fa');
            $table->string('name_en');
            $table->string('icon_url')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('product_allergen', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('allergen_id')->constrained()->cascadeOnDelete();
            $table->primary(['product_id', 'allergen_id']);
        });

        Schema::create('product_modifiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('name_fa');
            $table->string('name_en');
            $table->unsignedTinyInteger('min_select')->default(0);
            $table->unsignedTinyInteger('max_select')->default(1);
            $table->boolean('is_required')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('product_modifier_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('modifier_id')->constrained('product_modifiers')->cascadeOnDelete();
            $table->string('name_fa');
            $table->string('name_en');
            $table->unsignedBigInteger('price_minor')->default(0);
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('menu_banners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title_fa')->nullable();
            $table->string('title_en')->nullable();
            $table->string('image_url');
            $table->string('link_url')->nullable();
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('cafe_branches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name_fa');
            $table->string('name_en');
            $table->string('slug');
            $table->string('address_fa')->nullable();
            $table->string('address_en')->nullable();
            $table->string('phone')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
            $table->string('guest_name');
            $table->string('guest_phone', 32);
            $table->unsignedTinyInteger('party_size')->default(2);
            $table->dateTime('reserved_at');
            $table->string('status')->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('cafe_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
            $table->string('title_fa');
            $table->string('title_en');
            $table->text('description_fa')->nullable();
            $table->text('description_en')->nullable();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->unsignedSmallInteger('capacity')->default(0);
            $table->unsignedBigInteger('price_minor')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('event_bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('cafe_events')->cascadeOnDelete();
            $table->string('guest_name');
            $table->string('guest_phone', 32);
            $table->unsignedTinyInteger('seats')->default(1);
            $table->string('status')->default('pending');
            $table->timestamps();
        });

        Schema::table('carts', function (Blueprint $table) {
            $table->string('guest_token', 64)->nullable()->after('user_id');
            $table->string('table_number', 32)->nullable()->after('guest_token');
            $table->string('branch_slug')->nullable()->after('table_number');
            $table->json('meta')->nullable()->after('branch_slug');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('table_number', 32)->nullable()->after('customer_note');
            $table->string('branch_slug')->nullable()->after('table_number');
            $table->json('meta')->nullable()->after('branch_slug');
        });

        Schema::create('product_likes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('fingerprint', 64);
            $table->timestamps();
            $table->unique(['product_id', 'fingerprint']);
        });

        Schema::create('product_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating')->default(5);
            $table->text('comment')->nullable();
            $table->string('guest_phone', 32)->nullable();
            $table->string('fingerprint', 64)->nullable();
            $table->timestamps();
        });

        Schema::create('guest_phone_registrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('phone', 32);
            $table->string('fingerprint', 64);
            $table->timestamps();
            $table->unique(['tenant_id', 'fingerprint']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_phone_registrations');
        Schema::dropIfExists('product_feedback');
        Schema::dropIfExists('product_likes');
        Schema::dropIfExists('event_bookings');
        Schema::dropIfExists('cafe_events');
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('cafe_branches');
        Schema::dropIfExists('menu_banners');
        Schema::dropIfExists('product_modifier_options');
        Schema::dropIfExists('product_modifiers');
        Schema::dropIfExists('product_allergen');
        Schema::dropIfExists('allergens');
        Schema::dropIfExists('product_media');

        Schema::table('products', function (Blueprint $table) {
            $table->dropForeign(['menu_id']);
            $table->dropColumn([
                'menu_id', 'is_featured', 'is_sold_out', 'calories', 'spice_level',
                'cover_image_url', 'video_url',
            ]);
        });

        Schema::dropIfExists('menus');

        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn(['display_mode', 'cover_image_url']);
        });

        Schema::table('carts', function (Blueprint $table) {
            $table->dropColumn(['guest_token', 'table_number', 'branch_slug', 'meta']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['table_number', 'branch_slug', 'meta']);
        });
    }
};
