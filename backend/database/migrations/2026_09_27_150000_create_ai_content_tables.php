<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_jobs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('job_type', 64)->default('')->index();
            $table->string('target_type', 32)->default('');
            $table->unsignedBigInteger('target_id')->default(0);
            $table->json('payload')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->string('provider', 32)->default('');
            $table->string('model', 128)->default('');
            $table->unsignedInteger('tokens_in')->default(0);
            $table->unsignedInteger('tokens_out')->default(0);
            $table->decimal('cost_toman', 16, 4)->default(0);
            $table->text('error_message')->nullable();
            $table->text('result_summary')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'target_type', 'target_id']);
        });

        Schema::create('ai_calendar', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->date('slot_date')->index();
            $table->string('content_type', 20)->default('blog');
            $table->string('topic', 500)->default('');
            $table->string('focus_keyword', 255)->default('');
            $table->text('secondary_keywords')->nullable();
            $table->unsignedBigInteger('category_id')->default(0);
            $table->unsignedBigInteger('product_id')->default(0);
            $table->string('status', 20)->default('planned')->index();
            $table->unsignedBigInteger('job_id')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'content_type']);
        });

        Schema::create('ai_attr_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('product_cat_id');
            $table->json('attribute_ids');
            $table->json('labels')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'product_cat_id']);
        });

        Schema::create('ai_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('target_type', 32)->default('');
            $table->unsignedBigInteger('target_id')->default(0);
            $table->string('focus_keyword', 255)->default('')->index();
            $table->char('title_hash', 64)->default('')->index();
            $table->char('content_fingerprint', 64)->default('');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'target_type', 'target_id']);
        });

        Schema::create('ai_proposals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('kind', 32)->default('');
            $table->unsignedBigInteger('product_id')->default(0)->index();
            $table->json('current_json')->nullable();
            $table->json('proposed_json')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->timestamps();
            $table->unique(['tenant_id', 'kind', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_proposals');
        Schema::dropIfExists('ai_runs');
        Schema::dropIfExists('ai_attr_templates');
        Schema::dropIfExists('ai_calendar');
        Schema::dropIfExists('ai_jobs');
    }
};
