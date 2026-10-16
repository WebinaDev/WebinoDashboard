<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sms_ad_campaigns')) {
            return;
        }

        Schema::create('sms_ad_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('public_id', 32);
            $table->string('name', 16);
            $table->string('segment', 32);
            $table->string('channel', 16)->default('sms');
            $table->text('message');
            $table->unsignedBigInteger('product_id')->default(0);
            $table->unsignedBigInteger('category_id')->default(0);
            $table->string('content_type', 16)->default('product');
            $table->string('coupon_code', 64)->nullable();
            $table->timestamp('scheduled_at');
            $table->string('status', 16)->default('scheduled');
            $table->unsignedInteger('recipient_count')->default(0);
            $table->json('phones')->nullable();
            $table->unsignedInteger('sent')->default(0);
            $table->unsignedInteger('failed')->default(0);
            $table->decimal('cost', 14, 2)->default(0);
            $table->json('bulk_ids')->nullable();
            $table->string('utm_campaign', 64);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'public_id']);
            $table->index(['tenant_id', 'status', 'scheduled_at']);
            $table->index(['tenant_id', 'utm_campaign']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_ad_campaigns');
    }
};
