<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('products', 'vat_applicable')) {
            Schema::table('products', function (Blueprint $table) {
                // null = follow the category (default subject to VAT).
                $table->boolean('vat_applicable')->nullable();
            });
        }
        if (! Schema::hasColumn('categories', 'vat_applicable')) {
            Schema::table('categories', function (Blueprint $table) {
                $table->boolean('vat_applicable')->default(true);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('products', 'vat_applicable')) {
            Schema::table('products', fn (Blueprint $t) => $t->dropColumn('vat_applicable'));
        }
        if (Schema::hasColumn('categories', 'vat_applicable')) {
            Schema::table('categories', fn (Blueprint $t) => $t->dropColumn('vat_applicable'));
        }
    }
};
