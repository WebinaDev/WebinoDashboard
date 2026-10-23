<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media_assets', function (Blueprint $table) {
            if (! Schema::hasColumn('media_assets', 'original_path')) {
                $table->string('original_path')->nullable();
            }
            if (! Schema::hasColumn('media_assets', 'original_mime')) {
                $table->string('original_mime', 100)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('media_assets', function (Blueprint $table) {
            $table->dropColumn(['original_path', 'original_mime']);
        });
    }
};
