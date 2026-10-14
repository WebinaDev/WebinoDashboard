<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cms_pages', function (Blueprint $table) {
            $table->timestamp('builder_publish_at')->nullable();
            $table->timestamp('builder_unpublish_at')->nullable();
            $table->string('lang', 10)->nullable();
            $table->string('translation_group', 36)->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('cms_pages', function (Blueprint $table) {
            $table->dropIndex(['translation_group']);
            $table->dropColumn(['builder_publish_at', 'builder_unpublish_at', 'lang', 'translation_group']);
        });
    }
};
