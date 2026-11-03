<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Configurable loyalty missions beyond a single daily_points setting. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('loyalty_missions')) {
            return;
        }
        Schema::create('loyalty_missions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('type', 32); // daily_checkin|welcome|referral|first_order|order_count|order_amount|review|birthday|custom
            $table->string('title', 160);
            $table->string('description', 500)->nullable();
            $table->unsignedInteger('points')->default(0);
            $table->json('config')->nullable(); // thresholds, urls, cooldown, etc.
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['tenant_id', 'type', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_missions');
    }
};
