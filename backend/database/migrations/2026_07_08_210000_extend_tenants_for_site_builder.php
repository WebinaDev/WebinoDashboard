<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('business_category_slug', 64)->nullable()->after('default_currency');
            $table->string('business_type_slug', 64)->nullable()->after('business_category_slug');
            $table->string('vertical', 64)->nullable()->after('business_type_slug');
            $table->string('package_sku', 128)->nullable()->after('vertical');
            $table->string('theme_preset', 64)->nullable()->after('package_sku');
            $table->json('nav_preset')->nullable()->after('theme_preset');
            $table->json('branding')->nullable()->after('nav_preset');
            $table->string('provision_token', 128)->nullable()->after('branding');
            $table->unsignedBigInteger('crm_account_id')->nullable()->after('provision_token');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn([
                'business_category_slug',
                'business_type_slug',
                'vertical',
                'package_sku',
                'theme_preset',
                'nav_preset',
                'branding',
                'provision_token',
                'crm_account_id',
            ]);
        });
    }
};
