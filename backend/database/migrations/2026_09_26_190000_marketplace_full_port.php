<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketplace_product_maps', function (Blueprint $table) {
            $table->unsignedBigInteger('variant_key')->default(0)->after('product_variant_id');
            $table->json('meta')->nullable()->after('remote_stock');
        });
        DB::table('marketplace_product_maps')
            ->whereNotNull('product_variant_id')
            ->update(['variant_key' => DB::raw('product_variant_id')]);
        Schema::table('marketplace_product_maps', function (Blueprint $table) {
            $table->dropUnique('marketplace_map_unique');
            $table->unique(['product_id', 'variant_key', 'platform'], 'marketplace_map_variant_unique');
            $table->index(['tenant_id', 'platform', 'remote_product_id'], 'marketplace_map_remote_idx');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id')->nullable()->change();
        });

        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            Schema::table('orders', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable()->change();
            });
        }

        Schema::create('marketplace_order_maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 40);
            $table->string('remote_order_id', 120);
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 80)->nullable();
            $table->string('fulfillment', 40)->nullable();
            $table->json('raw')->nullable();
            $table->timestamp('last_sync_at')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'platform', 'remote_order_id'], 'marketplace_order_unique');
        });

        Schema::create('marketplace_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 40);
            $table->string('job_type', 80);
            $table->unsignedTinyInteger('priority')->default(5);
            $table->json('payload')->nullable();
            $table->string('status', 20)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'platform', 'status']);
        });

        Schema::create('marketplace_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 40);
            $table->string('level', 16)->default('info');
            $table->string('channel', 40)->default('general');
            $table->text('message');
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['tenant_id', 'platform', 'created_at']);
        });

        Schema::create('torob_pending_webhooks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->text('page_url');
            $table->timestamp('date_modified')->nullable();
            $table->unique(['tenant_id', 'product_id']);
            $table->index(['tenant_id', 'date_modified']);
        });

        Schema::create('basalam_category_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('category_id');
            $table->string('category_name')->nullable();
            $table->unsignedBigInteger('level1')->nullable();
            $table->unsignedBigInteger('level2')->nullable();
            $table->unsignedBigInteger('level3')->nullable();
            $table->string('basalam_category_name')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'category_id']);
        });

        Schema::create('basalam_option_maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('local_name');
            $table->string('basalam_name');
            $table->timestamps();
            $table->unique(['tenant_id', 'local_name']);
        });

        Schema::create('basalam_uploaded_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('type', 16);
            $table->string('source_identity', 191);
            $table->unsignedBigInteger('media_id');
            $table->string('media_url', 2083)->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'type', 'source_identity'], 'basalam_media_unique');
        });

        Schema::create('basalam_discount_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('product_variant_id')->nullable();
            $table->decimal('discount_percent', 5, 2)->default(0);
            $table->unsignedInteger('active_days')->default(0);
            $table->string('action', 10);
            $table->string('status', 12)->default('pending');
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('basalam_request_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('request_url', 500);
            $table->unsignedSmallInteger('status_code')->default(0);
            $table->boolean('success')->default(false);
            $table->unsignedInteger('response_time_ms')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('basalam_request_logs');
        Schema::dropIfExists('basalam_discount_tasks');
        Schema::dropIfExists('basalam_uploaded_media');
        Schema::dropIfExists('basalam_option_maps');
        Schema::dropIfExists('basalam_category_mappings');
        Schema::dropIfExists('torob_pending_webhooks');
        Schema::dropIfExists('marketplace_logs');
        Schema::dropIfExists('marketplace_jobs');
        Schema::dropIfExists('marketplace_order_maps');
        Schema::table('marketplace_product_maps', function (Blueprint $table) {
            $table->dropIndex('marketplace_map_remote_idx');
            $table->dropUnique('marketplace_map_variant_unique');
            $table->unique(['product_id', 'product_variant_id', 'platform'], 'marketplace_map_unique');
            $table->dropColumn(['variant_key', 'meta']);
        });
    }
};
