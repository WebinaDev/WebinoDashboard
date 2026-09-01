<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_types', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name_fa');
            $table->string('name_en');
            $table->string('default_theme_slug');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('tenants', function (Blueprint $table) {
            if (! Schema::hasColumn('tenants', 'site_type_slug')) {
                $table->string('site_type_slug')->nullable()->after('business_type_slug');
            }
            if (! Schema::hasColumn('tenants', 'default_locale')) {
                $table->string('default_locale', 8)->default('fa')->after('default_currency');
            }
        });

        Schema::create('submodules', function (Blueprint $table) {
            $table->string('module_slug');
            $table->string('slug');
            $table->string('name_fa')->nullable();
            $table->string('name_en')->nullable();
            $table->json('admin_nav')->nullable();
            $table->json('public_routes')->nullable();
            $table->boolean('is_core')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->primary(['module_slug', 'slug']);
            $table->foreign('module_slug')->references('slug')->on('dashboard_modules')->cascadeOnDelete();
        });

        Schema::create('site_type_activations', function (Blueprint $table) {
            $table->id();
            $table->string('site_type_slug');
            $table->string('module_slug');
            $table->string('submodule_slug');
            $table->boolean('enabled_by_default')->default(true);
            $table->timestamps();

            $table->foreign('site_type_slug')->references('slug')->on('site_types')->cascadeOnDelete();
            $table->unique(['site_type_slug', 'module_slug', 'submodule_slug'], 'sta_unique');
        });

        Schema::create('tenant_submodule_activations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('module_slug');
            $table->string('submodule_slug');
            $table->boolean('enabled')->default(false);
            $table->boolean('licensed')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'module_slug', 'submodule_slug'], 'tsa_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_submodule_activations');
        Schema::dropIfExists('site_type_activations');
        Schema::dropIfExists('submodules');
        Schema::table('tenants', function (Blueprint $table) {
            if (Schema::hasColumn('tenants', 'site_type_slug')) {
                $table->dropColumn('site_type_slug');
            }
            if (Schema::hasColumn('tenants', 'default_locale')) {
                $table->dropColumn('default_locale');
            }
        });
        Schema::dropIfExists('site_types');
    }
};
