<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_capability_overrides', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('capability', 128);
            $table->string('effect', 8)->default('allow');
            $table->unsignedBigInteger('granted_by')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'user_id', 'capability'], 'user_capability_override_unique');
            $table->index(['tenant_id', 'user_id', 'effect'], 'user_capability_override_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_capability_overrides');
    }
};
