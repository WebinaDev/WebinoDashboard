<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coupons', function (Blueprint $table) {
            if (! Schema::hasColumn('coupons', 'visibility')) {
                $table->string('visibility', 32)->default('public')->after('status');
            }
            if (! Schema::hasColumn('coupons', 'password')) {
                $table->string('password', 191)->nullable()->after('visibility');
            }
            if (! Schema::hasColumn('coupons', 'scheduled_at')) {
                $table->timestamp('scheduled_at')->nullable()->after('password');
            }
        });
    }

    public function down(): void
    {
        Schema::table('coupons', function (Blueprint $table) {
            foreach (['visibility', 'password', 'scheduled_at'] as $col) {
                if (Schema::hasColumn('coupons', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
