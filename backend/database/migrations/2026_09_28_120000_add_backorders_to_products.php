<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('products', 'backorders')) {
            Schema::table('products', function (Blueprint $table) {
                $table->string('backorders', 16)->default('no')->after('manage_stock');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('products', 'backorders')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropColumn('backorders');
            });
        }
    }
};
