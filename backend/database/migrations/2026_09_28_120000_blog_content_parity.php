<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('blog_posts', function (Blueprint $table) {
            $table->foreignId('cover_media_id')->nullable()->after('cover_url')->constrained('media_assets')->nullOnDelete();
            $table->string('visibility', 24)->default('public')->after('status');
            $table->string('password')->nullable()->after('visibility');
            $table->string('comment_status', 24)->default('open')->after('password');
        });

        Schema::table('blog_categories', function (Blueprint $table) {
            $table->json('seo')->nullable()->after('name');
        });

        Schema::create('blog_post_category', function (Blueprint $table) {
            $table->foreignId('blog_post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('blog_category_id')->constrained()->cascadeOnDelete();
            $table->primary(['blog_post_id', 'blog_category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blog_post_category');
        Schema::table('blog_categories', function (Blueprint $table) {
            $table->dropColumn('seo');
        });
        Schema::table('blog_posts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cover_media_id');
            $table->dropColumn(['visibility', 'password', 'comment_status']);
        });
    }
};
