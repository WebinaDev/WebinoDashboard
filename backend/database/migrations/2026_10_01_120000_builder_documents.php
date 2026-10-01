<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cms_pages', function (Blueprint $table) {
            $table->json('builder_draft')->nullable()->after('body');
            $table->json('builder_published')->nullable()->after('builder_draft');
        });

        Schema::create('builder_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 24);
            $table->string('title')->nullable();
            $table->json('draft')->nullable();
            $table->json('published')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'kind']);
        });

        Schema::create('wordpress_import_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('status', 24)->default('scaffold');
            $table->string('source_url', 500)->nullable();
            $table->json('summary')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wordpress_import_jobs');
        Schema::dropIfExists('builder_templates');

        Schema::table('cms_pages', function (Blueprint $table) {
            $table->dropColumn(['builder_draft', 'builder_published']);
        });
    }
};
