<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acc_persons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 255);
            $table->string('type', 20)->default('both');
            $table->string('national_id', 20)->nullable();
            $table->string('economic_code', 50)->nullable();
            $table->string('mobile', 30)->nullable();
            $table->text('address')->nullable();
            $table->string('category', 100)->nullable();
            $table->timestamps();
        });

        Schema::create('acc_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 255);
            $table->string('unit', 50)->nullable();
            $table->string('barcode', 100)->nullable();
            $table->string('category', 100)->nullable();
            $table->decimal('buy_price', 15, 2)->default(0);
            $table->decimal('sell_price', 15, 2)->default(0);
            $table->boolean('inventory_controlled')->default(false);
            $table->timestamps();
        });

        Schema::create('acc_invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30)->default('proforma');
            $table->string('number', 50)->nullable();
            $table->foreignId('fiscal_year_id')->nullable()->constrained('acc_fiscal_years')->nullOnDelete();
            $table->foreignId('person_id')->nullable()->constrained('acc_persons')->nullOnDelete();
            $table->date('document_date')->nullable();
            $table->string('status', 30)->default('draft');
            $table->json('items')->nullable();
            $table->decimal('subtotal', 18, 2)->default(0);
            $table->decimal('tax', 18, 2)->default(0);
            $table->decimal('total', 18, 2)->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('acc_cash_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 191);
            $table->string('type', 30)->default('bank');
            $table->string('bank_name', 191)->nullable();
            $table->string('account_number', 100)->nullable();
            $table->string('sheba', 30)->nullable();
            $table->string('card_number', 30)->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('acc_receipt_vouchers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30)->default('receipt');
            $table->string('number', 50)->nullable();
            $table->foreignId('fiscal_year_id')->nullable()->constrained('acc_fiscal_years')->nullOnDelete();
            $table->foreignId('cash_account_id')->nullable()->constrained('acc_cash_accounts')->nullOnDelete();
            $table->foreignId('person_id')->nullable()->constrained('acc_persons')->nullOnDelete();
            $table->decimal('amount', 18, 2)->default(0);
            $table->date('document_date')->nullable();
            $table->string('status', 30)->default('draft');
            $table->text('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('acc_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30)->default('receivable');
            $table->string('number', 50)->nullable();
            $table->string('bank', 191)->nullable();
            $table->decimal('amount', 18, 2)->default(0);
            $table->date('due_date')->nullable();
            $table->string('status', 30)->default('pending');
            $table->foreignId('cash_account_id')->nullable()->constrained('acc_cash_accounts')->nullOnDelete();
            $table->foreignId('person_id')->nullable()->constrained('acc_persons')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('acc_warehouses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 191);
            $table->text('address')->nullable();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('acc_warehouse_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30);
            $table->foreignId('warehouse_id')->constrained('acc_warehouses')->cascadeOnDelete();
            $table->string('number', 50)->nullable();
            $table->date('document_date')->nullable();
            $table->string('status', 30)->default('draft');
            $table->string('reference', 191)->nullable();
            $table->json('items')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('acc_warehouse_stock', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('acc_warehouses')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('acc_products')->cascadeOnDelete();
            $table->decimal('quantity', 18, 4)->default(0);
            $table->decimal('reorder_point', 18, 4)->nullable();
            $table->timestamps();
            $table->unique(['warehouse_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_warehouse_stock');
        Schema::dropIfExists('acc_warehouse_documents');
        Schema::dropIfExists('acc_warehouses');
        Schema::dropIfExists('acc_checks');
        Schema::dropIfExists('acc_receipt_vouchers');
        Schema::dropIfExists('acc_cash_accounts');
        Schema::dropIfExists('acc_invoices');
        Schema::dropIfExists('acc_products');
        Schema::dropIfExists('acc_persons');
    }
};
