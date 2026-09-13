<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dashboard_modules', function (Blueprint $table) {
            $table->string('distribution', 16)->default('bundled')->after('slug');
        });

        $bundled = ['core', 'users', 'cms'];
        DB::table('dashboard_modules')
            ->whereNotIn('slug', $bundled)
            ->update(['distribution' => 'git', 'requires_license' => true]);

        DB::table('dashboard_modules')
            ->whereIn('slug', $bundled)
            ->update(['distribution' => 'bundled', 'requires_license' => false]);
    }

    public function down(): void
    {
        Schema::table('dashboard_modules', function (Blueprint $table) {
            $table->dropColumn('distribution');
        });
    }
};
