<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_terms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20); // folder|category|tag
            $table->string('name');
            $table->string('slug');
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'kind', 'slug']);
            $table->index(['tenant_id', 'kind', 'parent_id']);
        });

        Schema::create('media_asset_term', function (Blueprint $table) {
            $table->id();
            $table->foreignId('media_asset_id')->constrained('media_assets')->cascadeOnDelete();
            $table->foreignId('media_term_id')->constrained('media_terms')->cascadeOnDelete();
            $table->unique(['media_asset_id', 'media_term_id']);
        });

        Schema::table('media_assets', function (Blueprint $table) {
            $table->string('title')->nullable()->after('original_name');
            $table->string('slug')->nullable()->after('title');
            $table->text('caption')->nullable()->after('slug');
            $table->text('description')->nullable()->after('caption');
            $table->foreignId('folder_term_id')->nullable()->after('folder')
                ->constrained('media_terms')->nullOnDelete();
        });

        Schema::create('magazine_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->text('description')->nullable();
            $table->json('seo')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'parent_id']);
        });

        Schema::create('magazine_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('magazine_article_category', function (Blueprint $table) {
            $table->id();
            $table->foreignId('magazine_article_id')->constrained('magazine_articles')->cascadeOnDelete();
            $table->foreignId('magazine_category_id')->constrained('magazine_categories')->cascadeOnDelete();
            $table->unique(['magazine_article_id', 'magazine_category_id'], 'mag_article_cat_unique');
        });

        Schema::create('magazine_article_tag', function (Blueprint $table) {
            $table->id();
            $table->foreignId('magazine_article_id')->constrained('magazine_articles')->cascadeOnDelete();
            $table->foreignId('magazine_tag_id')->constrained('magazine_tags')->cascadeOnDelete();
            $table->unique(['magazine_article_id', 'magazine_tag_id'], 'mag_article_tag_unique');
        });

        Schema::table('magazine_articles', function (Blueprint $table) {
            $table->foreignId('featured_media_id')->nullable()->after('cover_url')
                ->constrained('media_assets')->nullOnDelete();
            $table->string('comment_status', 20)->default('open')->after('status');
            $table->string('visibility', 20)->default('public')->after('comment_status');
            $table->string('password')->nullable()->after('visibility');
            $table->json('seo')->nullable()->after('password');
        });

        Schema::table('cms_pages', function (Blueprint $table) {
            $table->unsignedBigInteger('parent_id')->nullable()->after('tenant_id');
            $table->text('excerpt')->nullable()->after('title');
            $table->string('status', 24)->default('draft')->after('published');
            $table->foreignId('featured_media_id')->nullable()->after('body')
                ->constrained('media_assets')->nullOnDelete();
            $table->string('comment_status', 20)->default('closed')->after('featured_media_id');
            $table->string('visibility', 20)->default('public')->after('comment_status');
            $table->string('password')->nullable()->after('visibility');
            $table->json('seo')->nullable()->after('password');
            $table->index(['tenant_id', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::table('cms_pages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('featured_media_id');
            $table->dropColumn([
                'parent_id', 'excerpt', 'status', 'comment_status', 'visibility', 'password', 'seo',
            ]);
        });

        Schema::table('magazine_articles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('featured_media_id');
            $table->dropColumn(['comment_status', 'visibility', 'password', 'seo']);
        });

        Schema::dropIfExists('magazine_article_tag');
        Schema::dropIfExists('magazine_article_category');
        Schema::dropIfExists('magazine_tags');
        Schema::dropIfExists('magazine_categories');

        Schema::table('media_assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('folder_term_id');
            $table->dropColumn(['title', 'slug', 'caption', 'description']);
        });

        Schema::dropIfExists('media_asset_term');
        Schema::dropIfExists('media_terms');
    }
};
