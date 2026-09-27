<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->json('meta')->nullable()->after('views_count');
        });

        Schema::table('brands', function (Blueprint $table) {
            $table->json('meta')->nullable()->after('views_count');
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('meta');
        });

        Schema::table('brands', function (Blueprint $table) {
            $table->dropColumn('meta');
        });
    }
};
