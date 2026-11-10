<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive: gift cards (issue, balance, redeem at checkout) and per-variant cart lines.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('gift_cards')) {
            Schema::create('gift_cards', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('code', 40);
                $table->unsignedBigInteger('initial_minor')->default(0);
                $table->unsignedBigInteger('balance_minor')->default(0);
                $table->string('currency', 8)->default('IRT');
                $table->string('status', 20)->default('active');
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->string('recipient_name')->nullable();
                $table->string('recipient_phone', 32)->nullable();
                $table->string('recipient_email')->nullable();
                $table->text('message')->nullable();
                $table->text('note')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('source_order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['tenant_id', 'code']);
                $table->index(['tenant_id', 'status']);
            });
        }

        if (! Schema::hasTable('gift_card_transactions')) {
            Schema::create('gift_card_transactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('gift_card_id')->constrained('gift_cards')->cascadeOnDelete();
                $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->string('type', 20);
                $table->bigInteger('amount_minor');
                $table->unsignedBigInteger('balance_after_minor')->default(0);
                $table->string('note')->nullable();
                $table->timestamps();
                $table->index(['gift_card_id', 'created_at']);
                $table->index(['order_id']);
            });
        }

        if (Schema::hasTable('cart_items') && ! Schema::hasColumn('cart_items', 'product_variant_id')) {
            Schema::table('cart_items', function (Blueprint $table) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('cart_items') && Schema::hasColumn('cart_items', 'product_variant_id')) {
            Schema::table('cart_items', function (Blueprint $table) {
                $table->dropColumn('product_variant_id');
            });
        }
        Schema::dropIfExists('gift_card_transactions');
        Schema::dropIfExists('gift_cards');
    }
};
