<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('builder_form_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('form_key', 100);
            $table->string('token_hash', 64)->unique();
            $table->string('path', 255);
            $table->string('original_name', 180);
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->foreignId('submission_id')->nullable()->constrained('builder_form_submissions')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('builder_ab_tests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('page_id')->constrained('cms_pages')->cascadeOnDelete();
            $table->foreignId('variant_page_id')->constrained('cms_pages')->cascadeOnDelete();
            $table->unsignedTinyInteger('split')->default(50);
            $table->string('status', 20)->default('running');
            $table->unsignedInteger('views_a')->default(0);
            $table->unsignedInteger('views_b')->default(0);
            $table->unsignedInteger('conversions_a')->default(0);
            $table->unsignedInteger('conversions_b')->default(0);
            $table->timestamps();
            $table->unique(['tenant_id', 'page_id']);
        });

        Schema::create('builder_collections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('slug', 80);
            $table->string('name', 120);
            $table->json('fields');
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('builder_collection_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('collection_id')->constrained('builder_collections')->cascadeOnDelete();
            $table->string('slug', 120);
            $table->string('title', 200);
            $table->json('data');
            $table->boolean('published')->default(true);
            $table->integer('sort')->default(0);
            $table->timestamps();
            $table->unique(['collection_id', 'slug']);
            $table->index(['tenant_id', 'collection_id', 'published']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('builder_collection_items');
        Schema::dropIfExists('builder_collections');
        Schema::dropIfExists('builder_ab_tests');
        Schema::dropIfExists('builder_form_files');
    }
};
