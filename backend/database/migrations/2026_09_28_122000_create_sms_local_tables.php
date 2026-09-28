<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sms_drafts')) {
            Schema::create('sms_drafts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('title', 191)->nullable();
                $table->text('body');
                $table->json('recipients')->nullable();
                $table->timestamps();
                $table->index(['tenant_id', 'id']);
            });
        }

        if (! Schema::hasTable('sms_newsletter_subscribers')) {
            Schema::create('sms_newsletter_subscribers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('phone', 32);
                $table->unsignedBigInteger('product_id')->default(0);
                $table->timestamps();
                $table->unique(['tenant_id', 'phone', 'product_id']);
                $table->index(['tenant_id', 'product_id']);
            });
        }

        if (! Schema::hasTable('sms_scheduled_sends')) {
            Schema::create('sms_scheduled_sends', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('path', 64)->default('send');
                $table->json('payload');
                $table->text('message')->nullable();
                $table->string('from_number', 32)->nullable();
                $table->json('recipients')->nullable();
                $table->timestamp('send_at');
                $table->string('status', 16)->default('pending');
                $table->json('result')->nullable();
                $table->text('error')->nullable();
                $table->timestamp('processed_at')->nullable();
                $table->timestamps();
                $table->index(['status', 'send_at']);
                $table->index(['tenant_id', 'status']);
            });
        }

        if (! Schema::hasTable('sms_secretary_logs')) {
            Schema::create('sms_secretary_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('inbox_id', 64);
                $table->unsignedBigInteger('rule_id')->nullable();
                $table->string('phone', 32)->nullable();
                $table->boolean('ok')->default(false);
                $table->text('error')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'inbox_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_secretary_logs');
        Schema::dropIfExists('sms_scheduled_sends');
        Schema::dropIfExists('sms_newsletter_subscribers');
        Schema::dropIfExists('sms_drafts');
    }
};
