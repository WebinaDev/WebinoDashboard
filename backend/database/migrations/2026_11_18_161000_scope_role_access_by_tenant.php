<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_role_access_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('role', 64);
            $table->boolean('capabilities_configured')->default(false);
            $table->boolean('menu_acl_configured')->default(false);
            $table->timestamps();
            $table->unique(['tenant_id', 'role'], 'tenant_role_access_setting_unique');
        });
        Schema::table('role_capabilities', function (Blueprint $table): void {
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id')->index();
            $table->dropUnique('role_capabilities_role_capability_unique');
            $table->unique(['tenant_id', 'role', 'capability'], 'role_capability_tenant_unique');
        });
        Schema::table('role_menu_acl', function (Blueprint $table): void {
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id')->index();
            $table->dropUnique('role_menu_acl_role_menu_key_unique');
            $table->unique(['tenant_id', 'role', 'menu_key'], 'role_menu_acl_tenant_unique');
        });
    }

    public function down(): void
    {
        Schema::table('role_menu_acl', function (Blueprint $table): void {
            $table->dropUnique('role_menu_acl_tenant_unique');
            $table->dropIndex(['tenant_id']);
            $table->dropColumn('tenant_id');
            $table->unique(['role', 'menu_key']);
        });
        Schema::table('role_capabilities', function (Blueprint $table): void {
            $table->dropUnique('role_capability_tenant_unique');
            $table->dropIndex(['tenant_id']);
            $table->dropColumn('tenant_id');
            $table->unique(['role', 'capability']);
        });
        Schema::dropIfExists('tenant_role_access_settings');
    }
};
