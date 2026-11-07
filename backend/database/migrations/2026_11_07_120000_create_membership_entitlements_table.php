<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('membership_entitlements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('plan_id', 32);
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->index();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'user_id', 'ends_at']);
        });

        Schema::create('poetry_download_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('guest_key', 64)->nullable()->index();
            $table->unsignedBigInteger('media_id')->nullable()->index();
            $table->string('kind', 16)->default('audio');
            $table->timestamps();
            $table->index(['tenant_id', 'user_id', 'created_at']);
            $table->index(['tenant_id', 'guest_key', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poetry_download_logs');
        Schema::dropIfExists('membership_entitlements');
    }
};
