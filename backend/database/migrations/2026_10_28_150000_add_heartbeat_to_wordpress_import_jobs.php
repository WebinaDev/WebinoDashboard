<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('wordpress_import_jobs', 'heartbeat_at')) {
            return;
        }
        Schema::table('wordpress_import_jobs', function (Blueprint $table) {
            $table->timestamp('heartbeat_at')->nullable()->after('finished_at');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('wordpress_import_jobs', 'heartbeat_at')) {
            Schema::table('wordpress_import_jobs', function (Blueprint $table) {
                $table->dropColumn('heartbeat_at');
            });
        }
    }
};
