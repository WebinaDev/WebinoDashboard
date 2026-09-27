<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_downloads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('storage_path');
            $table->string('original_name')->nullable();
            $table->unsignedInteger('download_limit')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['tenant_id', 'product_id']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (! Schema::hasColumn('order_items', 'download_count')) {
                $table->unsignedInteger('download_count')->default(0)->after('meta');
            }
            if (! Schema::hasColumn('order_items', 'requires_login')) {
                $table->boolean('requires_login')->default(false)->after('download_count');
            }
        });

        Schema::create('product_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('body')->nullable();
            $table->string('author_name')->nullable();
            $table->string('status')->default('pending'); // pending|approved|rejected
            $table->timestamps();
            $table->index(['tenant_id', 'product_id', 'status']);
        });

        Schema::create('loyalty_rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('uid')->nullable();
            $table->string('title');
            $table->string('image_url')->nullable();
            $table->unsignedInteger('points_cost');
            $table->string('discount_type')->default('percent'); // percent|fixed
            $table->unsignedInteger('discount_amount')->default(0);
            $table->unsignedBigInteger('min_cart_minor')->nullable();
            $table->unsignedInteger('validity_days')->nullable();
            $table->json('product_ids')->nullable();
            $table->json('category_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['tenant_id', 'is_active']);
        });

        Schema::create('loyalty_ledger', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('loyalty_reward_id')->nullable()->constrained('loyalty_rewards')->nullOnDelete();
            $table->integer('points'); // positive earn, negative spend
            $table->string('reason')->nullable();
            $table->string('coupon_code')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'user_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'loyalty_points')) {
                $table->unsignedInteger('loyalty_points')->default(0)->after('wallet_balance_minor');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'loyalty_points')) {
                $table->dropColumn('loyalty_points');
            }
        });
        Schema::dropIfExists('loyalty_ledger');
        Schema::dropIfExists('loyalty_rewards');
        Schema::dropIfExists('product_reviews');
        Schema::table('order_items', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('order_items', 'download_count')) {
                $cols[] = 'download_count';
            }
            if (Schema::hasColumn('order_items', 'requires_login')) {
                $cols[] = 'requires_login';
            }
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });
        Schema::dropIfExists('product_downloads');
    }
};
