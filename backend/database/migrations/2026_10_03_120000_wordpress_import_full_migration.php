<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('blog_posts', function (Blueprint $table) {
            $table->json('builder_draft')->nullable()->after('body');
        });

        Schema::create('wordpress_redirects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('from_path', 191);
            $table->string('to_path', 500);
            $table->unsignedSmallInteger('status_code')->default(301);
            $table->string('kind', 24)->default('redirect');
            $table->string('resource', 32)->nullable();
            $table->string('external_id', 191)->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'from_path'], 'wp_redirect_path_unique');
        });

        Schema::create('wordpress_import_queue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('job_id')->nullable()->constrained('wordpress_import_jobs')->nullOnDelete();
            $table->string('resource', 64);
            $table->string('external_id', 191);
            $table->string('label')->nullable();
            $table->string('status', 32)->default('needs_mapping');
            $table->json('payload');
            $table->timestamps();
            $table->unique(['tenant_id', 'resource', 'external_id'], 'wp_import_queue_unique');
        });

        Schema::create('wordpress_import_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('idempotency_key', 191);
            $table->unsignedSmallInteger('status_code');
            $table->json('body');
            $table->timestamps();
            $table->unique(['tenant_id', 'idempotency_key'], 'wp_import_receipt_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wordpress_import_receipts');
        Schema::dropIfExists('wordpress_import_queue');
        Schema::dropIfExists('wordpress_redirects');
        Schema::table('blog_posts', function (Blueprint $table) {
            $table->dropColumn('builder_draft');
        });
    }
};
