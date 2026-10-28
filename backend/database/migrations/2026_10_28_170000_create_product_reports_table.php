<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Shopper-submitted product reports: "seen it cheaper" (lower_price) and "problem with this product" (issue). WP parity. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_reports')) {
            return;
        }
        Schema::create('product_reports', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $t->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('type', 16);                       // lower_price | issue
            $t->string('issue_kind', 32)->nullable();     // wrong_info | wrong_price | image | other
            $t->string('name', 120)->nullable();
            $t->string('contact', 190)->nullable();       // phone or email
            $t->string('competitor_url', 1024)->nullable();
            $t->unsignedBigInteger('competitor_price_minor')->nullable();
            $t->text('message')->nullable();
            $t->string('status', 16)->default('new');     // new | reviewed | resolved | rejected
            $t->text('admin_note')->nullable();
            $t->string('ip', 45)->nullable();
            $t->timestamps();
            $t->index(['tenant_id', 'status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_reports');
    }
};
