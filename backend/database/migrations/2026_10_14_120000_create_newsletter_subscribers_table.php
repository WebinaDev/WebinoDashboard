<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_subscribers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('email')->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('source', 64)->nullable();
            $table->string('status', 16)->default('active');
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'email']);
            $table->unique(['tenant_id', 'phone']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_subscribers');
    }
};
