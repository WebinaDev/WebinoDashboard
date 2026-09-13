<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code');
            $table->string('type')->default('percent'); // percent|fixed_cart|fixed_product
            $table->unsignedBigInteger('amount')->default(0);
            $table->boolean('free_shipping')->default(false);
            $table->boolean('individual_use')->default(false);
            $table->boolean('exclude_sale')->default(false);
            $table->unsignedBigInteger('min_spend_minor')->nullable();
            $table->unsignedBigInteger('max_spend_minor')->nullable();
            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('usage_limit_per_user')->nullable();
            $table->unsignedInteger('usage_count')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->string('status')->default('publish'); // publish|draft|trash
            $table->text('description')->nullable();
            $table->json('restrictions')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['tenant_id', 'code']);
        });

        Schema::create('coupon_redemptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('discount_minor')->default(0);
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('coupon_code')->nullable()->after('discount_minor');
            $table->foreignId('coupon_id')->nullable()->after('coupon_code')->constrained('coupons')->nullOnDelete();
        });

        Schema::create('bot_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider'); // bale|telegram
            $table->boolean('enabled')->default(false);
            $table->text('token')->nullable();
            $table->string('webhook_secret')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'provider']);
        });

        Schema::create('bot_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('chat_id');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('last_seen_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'provider', 'chat_id']);
        });

        Schema::create('bot_message_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('chat_id')->nullable();
            $table->string('direction')->default('out'); // in|out
            $table->string('type')->default('text');
            $table->text('payload')->nullable();
            $table->string('status')->nullable();
            $table->timestamps();
        });

        Schema::create('bot_broadcast_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->boolean('active')->default(false);
            $table->string('status')->default('idle'); // idle|running|cancelled|finished|failed
            $table->string('type')->default('text');
            $table->text('text')->nullable();
            $table->string('media')->nullable();
            $table->string('segment')->default('all');
            $table->foreignId('campaign_id')->nullable();
            $table->unsignedInteger('total')->default(0);
            $table->unsignedInteger('sent')->default(0);
            $table->unsignedInteger('failed')->default(0);
            $table->unsignedInteger('cursor')->default(0);
            $table->json('chat_ids')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        Schema::create('bot_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('name');
            $table->string('status')->default('scheduled'); // scheduled|running|finished|cancelled
            $table->timestamp('scheduled_at')->nullable();
            $table->string('type')->default('text');
            $table->text('text')->nullable();
            $table->string('media')->nullable();
            $table->string('audience')->default('all'); // all|imported
            $table->json('user_ids')->nullable();
            $table->unsignedInteger('sent')->default(0);
            $table->unsignedInteger('failed')->default(0);
            $table->timestamps();
        });

        Schema::create('bot_imported_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('chat_id')->nullable();
            $table->string('phone')->nullable();
            $table->string('name')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bot_imported_contacts');
        Schema::dropIfExists('bot_campaigns');
        Schema::dropIfExists('bot_broadcast_jobs');
        Schema::dropIfExists('bot_message_logs');
        Schema::dropIfExists('bot_sessions');
        Schema::dropIfExists('bot_settings');

        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('coupon_id');
            $table->dropColumn(['coupon_code']);
        });

        Schema::dropIfExists('coupon_redemptions');
        Schema::dropIfExists('coupons');
    }
};
