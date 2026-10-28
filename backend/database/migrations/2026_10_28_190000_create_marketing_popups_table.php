<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Storefront popup manager: content + trigger + targeting + display (frequency) rules. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('marketing_popups')) {
            return;
        }
        Schema::create('marketing_popups', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $t->string('name', 120);
            $t->string('status', 16)->default('draft'); // draft | active | paused
            $t->unsignedInteger('priority')->default(0);
            $t->json('content')->nullable();   // title, body, image_url, cta_label, cta_url, coupon_code, collect: none|phone|email, theme, position
            $t->string('trigger', 16)->default('delay'); // load | delay | scroll | exit | idle
            $t->unsignedInteger('trigger_value')->default(5);
            $t->json('targeting')->nullable(); // include[], exclude[], devices[], audience, new_visitors_only
            $t->json('display')->nullable();   // frequency: always|session|once|days, days, max_views
            $t->timestamp('starts_at')->nullable();
            $t->timestamp('ends_at')->nullable();
            $t->unsignedBigInteger('views')->default(0);
            $t->unsignedBigInteger('clicks')->default(0);
            $t->unsignedBigInteger('closes')->default(0);
            $t->unsignedBigInteger('leads')->default(0);
            $t->timestamps();
            $t->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_popups');
    }
};
