<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            if (! Schema::hasColumn('tenants', 'license_status')) {
                $table->string('license_status', 32)->nullable()->after('license_key');
            }
            if (! Schema::hasColumn('tenants', 'license_checked_at')) {
                $table->timestamp('license_checked_at')->nullable()->after('license_status');
            }
            if (! Schema::hasColumn('tenants', 'license_unreachable')) {
                $table->boolean('license_unreachable')->default(false)->after('license_checked_at');
            }
            if (! Schema::hasColumn('tenants', 'license_last_error')) {
                $table->text('license_last_error')->nullable()->after('license_unreachable');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            foreach (['license_last_error', 'license_unreachable', 'license_checked_at', 'license_status'] as $col) {
                if (Schema::hasColumn('tenants', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
