<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('builder_library_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->index();
            $table->foreignId('user_id')->nullable();
            // section | page | widget
            $table->string('kind', 16)->default('section');
            $table->string('title', 160);
            $table->string('category', 80)->nullable();
            $table->json('document');
            $table->timestamps();
            $table->index(['tenant_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('builder_library_items');
    }
};
