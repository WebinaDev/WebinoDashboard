<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('product_reviews', 'admin_reply')) {
                $table->text('admin_reply')->nullable()->after('body');
            }
        });

        DB::table('product_reviews')->where('status', 'rejected')->update(['status' => 'spam']);
    }

    public function down(): void
    {
        Schema::table('product_reviews', function (Blueprint $table) {
            if (Schema::hasColumn('product_reviews', 'admin_reply')) {
                $table->dropColumn('admin_reply');
            }
        });
    }
};
