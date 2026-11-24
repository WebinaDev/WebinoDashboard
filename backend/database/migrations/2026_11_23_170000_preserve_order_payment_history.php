<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_payments', function (Blueprint $table): void {
            $table->timestamp('superseded_at')->nullable();
            $table->unsignedBigInteger('superseded_by')->nullable();
            $table->index(['tenant_id', 'order_id', 'superseded_at'], 'order_payments_active_idx');
        });
    }

    public function down(): void
    {
        // Preserve payment history.
    }
};
