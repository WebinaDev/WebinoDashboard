<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('builder_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->index();
            $table->string('target_type', 20);
            $table->unsignedBigInteger('target_id');
            $table->foreignId('user_id')->nullable();
            // save | autosave | publish | restore
            $table->string('reason', 16)->default('save');
            $table->json('document');
            $table->unsignedInteger('size')->default(0);
            $table->timestamps();
            $table->index(['tenant_id', 'target_type', 'target_id', 'id'], 'builder_revisions_target_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('builder_revisions');
    }
};
