<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('bot_channel_posts') && ! Schema::hasColumn('bot_channel_posts', 'blog_post_id')) {
            Schema::table('bot_channel_posts', function (Blueprint $t) {
                $t->unsignedBigInteger('blog_post_id')->nullable()->after('product_id');
                $t->index(['tenant_id', 'provider', 'blog_post_id']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('bot_channel_posts') && Schema::hasColumn('bot_channel_posts', 'blog_post_id')) {
            Schema::table('bot_channel_posts', function (Blueprint $t) {
                $t->dropIndex(['tenant_id', 'provider', 'blog_post_id']);
                $t->dropColumn('blog_post_id');
            });
        }
    }
};
