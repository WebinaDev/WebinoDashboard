<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wordpress_import_jobs', function (Blueprint $table) {
            $table->boolean('dry_run')->default(false)->after('source_url');
            $table->foreignId('created_by')->nullable()->after('dry_run')->constrained('users')->nullOnDelete();
            $table->json('options')->nullable()->after('summary');
            $table->json('progress')->nullable()->after('options');
            $table->text('last_error')->nullable()->after('progress');
            $table->timestamp('started_at')->nullable()->after('last_error');
            $table->timestamp('finished_at')->nullable()->after('started_at');
        });

        Schema::create('wordpress_import_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_id')->constrained('wordpress_import_jobs')->cascadeOnDelete();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('resource', 32);
            $table->string('external_id', 191);
            $table->json('payload');
            $table->string('status', 16)->default('pending');
            $table->string('action', 32)->nullable();
            $table->text('message')->nullable();
            $table->timestamps();
            $table->unique(['job_id', 'resource', 'external_id'], 'wp_import_item_unique');
            $table->index(['job_id', 'status']);
        });

        Schema::create('wordpress_import_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('resource', 32);
            $table->string('external_id', 191);
            $table->string('source_guid', 500)->nullable();
            $table->string('local_type', 80);
            $table->unsignedBigInteger('local_id');
            $table->timestamps();
            $table->unique(['tenant_id', 'resource', 'external_id'], 'wp_import_link_unique');
            $table->index(['tenant_id', 'local_type', 'local_id'], 'wp_import_link_local');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wordpress_import_links');
        Schema::dropIfExists('wordpress_import_items');

        Schema::table('wordpress_import_jobs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['dry_run', 'options', 'progress', 'last_error', 'started_at', 'finished_at']);
        });
    }
};
