<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('erp_announcements')) {
            Schema::create('erp_announcements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();
                $table->string('source_id', 64)->nullable()->unique();
                $table->string('title');
                $table->text('body')->nullable();
                $table->string('audience', 32)->default('all');
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->index(['tenant_id', 'created_at']);
            });
        }

        if (! Schema::hasTable('erp_announcement_reads')) {
            Schema::create('erp_announcement_reads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('announcement_id')->constrained('erp_announcements')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('read_at');
                $table->unique(['announcement_id', 'user_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_announcement_reads');
        Schema::dropIfExists('erp_announcements');
    }
};
