<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bulk_price_jobs', function (Blueprint $table) {
            $table->string('stage', 32)->default('pending')->after('status');
            $table->unsignedBigInteger('cursor_product_id')->default(0)->after('stage');
            $table->timestamp('locked_at')->nullable()->after('locked');
            $table->index(['tenant_id', 'status', 'locked']);
        });

        Schema::create('bulk_price_job_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bulk_price_job_id')->constrained('bulk_price_jobs')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('status', 24)->default('failed'); // done|skipped|failed
            $table->string('stage', 32)->nullable();
            $table->text('reason')->nullable();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->timestamps();
            $table->unique(['bulk_price_job_id', 'product_id']);
            $table->index(['bulk_price_job_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bulk_price_job_items');
        Schema::table('bulk_price_jobs', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'status', 'locked']);
            $table->dropColumn(['stage', 'cursor_product_id', 'locked_at']);
        });
    }
};
