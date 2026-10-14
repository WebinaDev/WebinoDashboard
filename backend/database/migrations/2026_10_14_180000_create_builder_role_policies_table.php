<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('builder_role_policies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('role', 40);
            $table->boolean('can_edit')->default(true);
            $table->boolean('can_publish')->default(true);
            $table->boolean('can_design')->default(true);
            $table->timestamps();
            $table->unique(['tenant_id', 'role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('builder_role_policies');
    }
};
