<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acc_user_defaults', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('fiscal_year_id')->nullable()->constrained('acc_fiscal_years')->nullOnDelete();
            $table->foreignId('cash_account_id')->nullable()->constrained('acc_cash_accounts')->nullOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('acc_warehouses')->nullOnDelete();
            $table->foreignId('price_list_id')->nullable()->constrained('acc_price_lists')->nullOnDelete();
            $table->decimal('tax_rate', 5, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_user_defaults');
    }
};
