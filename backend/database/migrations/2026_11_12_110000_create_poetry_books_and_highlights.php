<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Additive: poem collections published as a book, and story-like highlights (image or 16:9 video). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('poetry_books')) {
            Schema::create('poetry_books', function (Blueprint $t) {
                $t->id();
                $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $t->string('slug', 190);
                $t->string('title', 255);
                $t->string('subtitle', 255)->nullable();
                $t->text('description')->nullable();
                $t->string('cover', 1024)->nullable();
                $t->string('publisher', 160)->nullable();
                $t->string('published_label', 80)->nullable();
                $t->unsignedInteger('pages')->nullable();
                $t->string('isbn', 32)->nullable();
                $t->unsignedBigInteger('product_id')->nullable();
                $t->string('purchase_url', 1024)->nullable();
                $t->string('cta_label', 80)->nullable();
                $t->boolean('is_premium')->default(false);
                $t->unsignedInteger('sort')->default(0);
                $t->string('status', 16)->default('published');
                $t->json('seo')->nullable();
                $t->timestamps();
                $t->unique(['tenant_id', 'slug']);
            });
        }
        if (! Schema::hasTable('poetry_book_poem')) {
            Schema::create('poetry_book_poem', function (Blueprint $t) {
                $t->foreignId('book_id')->constrained('poetry_books')->cascadeOnDelete();
                $t->foreignId('poem_id')->constrained('poetry_poems')->cascadeOnDelete();
                $t->unsignedInteger('position')->default(0);
                $t->primary(['book_id', 'poem_id']);
            });
        }
        if (! Schema::hasTable('poetry_highlights')) {
            Schema::create('poetry_highlights', function (Blueprint $t) {
                $t->id();
                $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $t->string('title', 255);
                $t->string('kind', 10)->default('image');
                $t->unsignedBigInteger('media_id')->nullable();
                $t->string('file_url', 1024)->nullable();
                $t->string('external_url', 1024)->nullable();
                $t->string('cover', 1024)->nullable();
                $t->string('link_url', 1024)->nullable();
                $t->string('link_label', 80)->nullable();
                $t->string('duration', 16)->nullable();
                $t->boolean('is_premium')->default(false);
                $t->unsignedInteger('sort')->default(0);
                $t->string('status', 16)->default('published');
                $t->timestamps();
                $t->index(['tenant_id', 'status', 'sort']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('poetry_highlights');
        Schema::dropIfExists('poetry_book_poem');
        Schema::dropIfExists('poetry_books');
    }
};
