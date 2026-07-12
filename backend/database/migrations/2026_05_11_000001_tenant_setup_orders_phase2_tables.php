<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->boolean('setup_completed')->default(true)->after('license_key');
            $table->string('store_display_name')->nullable()->after('setup_completed');
            $table->string('default_currency', 8)->default('IRR')->after('store_display_name');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->text('shipping_address')->nullable()->after('currency');
            $table->string('customer_phone', 32)->nullable()->after('shipping_address');
            $table->string('customer_note', 500)->nullable()->after('customer_phone');
        });

        Schema::create('marketing_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('status', 24)->default('draft');
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('cms_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('slug');
            $table->string('title');
            $table->text('body')->nullable();
            $table->boolean('published')->default(false);
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cms_pages');
        Schema::dropIfExists('marketing_campaigns');

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['shipping_address', 'customer_phone', 'customer_note']);
        });

        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['setup_completed', 'store_display_name', 'default_currency']);
        });
    }
};
