<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('link_hub_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('profile_id')->constrained('link_hub_profiles')->cascadeOnDelete();
            $table->foreignId('block_id')->nullable()->constrained('link_hub_blocks')->nullOnDelete();
            $table->string('kind', 16); // view | click
            $table->string('visitor_hash', 64)->nullable();
            $table->string('target', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'kind', 'created_at']);
            $table->index(['profile_id', 'kind', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('link_hub_events');
    }
};
