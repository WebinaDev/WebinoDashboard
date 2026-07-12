<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('domain')->nullable()->index();
            $table->string('license_key')->nullable();
            $table->timestamps();
        });

        Schema::create('dashboard_modules', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('git_repo')->nullable();
            $table->string('default_version')->nullable();
            $table->boolean('requires_license')->default(true);
            $table->timestamps();
        });

        Schema::create('tenant_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('module_slug');
            $table->boolean('enabled')->default(false);
            $table->boolean('licensed')->default(false);
            $table->string('installed_version')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'module_slug']);
            $table->foreign('module_slug')->references('slug')->on('dashboard_modules')->cascadeOnDelete();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->string('role')->default('admin')->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tenant_id');
            $table->dropColumn('role');
        });
        Schema::dropIfExists('tenant_modules');
        Schema::dropIfExists('dashboard_modules');
        Schema::dropIfExists('tenants');
    }
};
