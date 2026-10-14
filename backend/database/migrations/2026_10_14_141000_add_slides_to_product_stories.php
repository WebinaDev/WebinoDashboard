<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_stories') && ! Schema::hasColumn('product_stories', 'slides')) {
            Schema::table('product_stories', function (Blueprint $table) {
                $table->json('slides')->nullable()->after('media_type');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('product_stories', 'slides')) {
            Schema::table('product_stories', fn (Blueprint $table) => $table->dropColumn('slides'));
        }
    }
};
