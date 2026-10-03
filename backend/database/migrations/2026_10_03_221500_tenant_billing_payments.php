<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_billing_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('erp_payment_id')->nullable()->index();
            $table->string('bill_id');
            $table->string('bill_kind', 32)->nullable();
            $table->string('bill_title')->nullable();
            $table->string('gateway', 32);
            $table->string('mode', 16);
            $table->unsignedBigInteger('base_minor')->default(0);
            $table->unsignedBigInteger('fee_minor')->default(0);
            $table->decimal('fee_percent', 6, 2)->default(0);
            $table->unsignedBigInteger('total_minor')->default(0);
            $table->string('currency', 8)->default('IRT');
            $table->string('status', 24)->default('pending');
            $table->text('redirect_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_billing_payments');
    }
};
