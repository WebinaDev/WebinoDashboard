<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('number')->nullable()->after('id');
            $table->foreignId('created_by')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
            $table->string('customer_name')->nullable()->after('customer_phone');
            $table->string('customer_email')->nullable()->after('customer_name');
            $table->string('sales_channel')->nullable(); // in_store|phone|bale|eitaa|rubika|telegram|instagram|other|online
            $table->string('payment_tender')->nullable(); // cash|card_to_card|pos_terminal|online|wallet|other
            $table->unsignedBigInteger('amount_paid_minor')->nullable();
            $table->unsignedBigInteger('discount_minor')->default(0);
            $table->unsignedBigInteger('shipping_minor')->default(0);
            $table->unsignedBigInteger('subtotal_minor')->default(0);
            $table->boolean('is_pos')->default(false);
            $table->boolean('is_pay_link')->default(false);
            $table->json('buyer_tax')->nullable();
            $table->json('billing_address')->nullable();
            $table->string('utm_source')->nullable();
            $table->string('utm_medium')->nullable();
            $table->string('utm_campaign')->nullable();
            $table->timestamp('printed_at')->nullable();
            $table->string('c2c_status')->nullable(); // pending|approved|rejected
            $table->string('c2c_receipt_url')->nullable();
            $table->unsignedBigInteger('c2c_decided_by')->nullable();
            $table->timestamp('c2c_decided_at')->nullable();
            $table->string('payment_url')->nullable();
            $table->softDeletes();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->unique(['tenant_id', 'number']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->string('product_name')->nullable()->after('product_id');
            $table->string('sku')->nullable()->after('product_name');
            $table->foreignId('product_variant_id')->nullable()->after('sku')->constrained('product_variants')->nullOnDelete();
            $table->string('purchase_type')->default('cash')->after('unit_price_minor'); // cash|credit|installment|wholesale
            $table->json('meta')->nullable()->after('purchase_type');
        });

        Schema::create('order_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->boolean('is_customer')->default(false);
            $table->timestamps();
        });

        Schema::create('order_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('requested'); // requested|approved|rejected|received|refunded
            $table->text('reason')->nullable();
            $table->json('items')->nullable();
            $table->unsignedBigInteger('refund_minor')->nullable();
            $table->text('admin_note')->nullable();
            $table->timestamps();
        });

        Schema::create('c2c_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('wallet_balance_minor')->default(0)->after('remember_token');
            $table->string('bank_sheba')->nullable()->after('wallet_balance_minor');
        });

        Schema::create('wallet_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id']);
        });

        Schema::create('wallet_ledger', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('direction'); // credit|debit
            $table->unsignedBigInteger('amount_minor');
            $table->unsignedBigInteger('balance_after_minor');
            $table->string('reason'); // topup|checkout|checkout_restore|withdraw_request|withdraw_rejected|order_refund|admin_adjust
            $table->string('ref_type')->nullable();
            $table->unsignedBigInteger('ref_id')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'user_id']);
        });

        Schema::create('wallet_withdrawals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('amount_minor');
            $table->string('sheba')->nullable();
            $table->string('status')->default('pending'); // pending|approved|rejected|paid
            $table->text('admin_note')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_withdrawals');
        Schema::dropIfExists('wallet_ledger');
        Schema::dropIfExists('wallet_settings');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['wallet_balance_minor', 'bank_sheba']);
        });
        Schema::dropIfExists('c2c_settings');
        Schema::dropIfExists('order_returns');
        Schema::dropIfExists('order_notes');

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_variant_id');
            $table->dropColumn(['product_name', 'sku', 'purchase_type', 'meta']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'number']);
            $table->dropConstrainedForeignId('created_by');
            $table->dropSoftDeletes();
            $table->dropColumn([
                'number', 'customer_name', 'customer_email', 'sales_channel', 'payment_tender',
                'amount_paid_minor', 'discount_minor', 'shipping_minor', 'subtotal_minor',
                'is_pos', 'is_pay_link', 'buyer_tax', 'billing_address',
                'utm_source', 'utm_medium', 'utm_campaign', 'printed_at',
                'c2c_status', 'c2c_receipt_url', 'c2c_decided_by', 'c2c_decided_at', 'payment_url',
            ]);
        });
    }
};
