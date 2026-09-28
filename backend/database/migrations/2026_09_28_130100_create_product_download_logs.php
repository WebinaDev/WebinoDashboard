<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_download_logs')) {
            return;
        }

        Schema::create('product_download_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id')->index();
            $table->unsignedBigInteger('order_item_id')->nullable()->index();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamp('downloaded_at');
            $table->index(['tenant_id', 'downloaded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_download_logs');
    }
};
