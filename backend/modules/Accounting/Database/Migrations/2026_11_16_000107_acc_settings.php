<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tenant-scoped replacement for the ERP's global `system_settings` table.
 *
 * The ERP stores accounting preferences (default fiscal year, money display) in
 * Core's one-row-per-key `system_settings` table, which has no tenant column. This
 * module keeps the same key/value shape but scopes it, so two shops can hold
 * different currencies and fiscal years.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acc_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('key', 191);
            $table->text('value')->nullable();
            $table->string('group', 64)->default('general');
            $table->timestamps();

            $table->unique(['tenant_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_settings');
    }
};
