<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Per-item membership lock for standalone poetry audio/video. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('poetry_media') || Schema::hasColumn('poetry_media', 'is_premium')) {
            return;
        }
        Schema::table('poetry_media', function (Blueprint $t) {
            $t->boolean('is_premium')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('poetry_media') || ! Schema::hasColumn('poetry_media', 'is_premium')) {
            return;
        }
        Schema::table('poetry_media', function (Blueprint $t) {
            $t->dropColumn('is_premium');
        });
    }
};
