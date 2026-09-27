<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            $table->string('purchase_type', 16)->nullable()->after('quantity');
            $table->unsignedSmallInteger('installment_months')->nullable()->after('purchase_type');
        });
    }

    public function down(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            $table->dropColumn(['purchase_type', 'installment_months']);
        });
    }
};
