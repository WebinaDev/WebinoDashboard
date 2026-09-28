<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coupons', function (Blueprint $table) {
            $table->string('condition_type')->default('none');
            $table->unsignedInteger('condition_value')->nullable();
            $table->boolean('auto_apply')->default(false);
            $table->unsignedBigInteger('max_discount_minor')->nullable();
            $table->unsignedTinyInteger('shipping_percent')->nullable();
            $table->index(['tenant_id', 'auto_apply', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('coupons', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'auto_apply', 'status']);
            $table->dropColumn(['condition_type', 'condition_value', 'auto_apply', 'max_discount_minor', 'shipping_percent']);
        });
    }
};
