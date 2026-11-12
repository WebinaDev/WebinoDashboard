<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive: premium membership (plans, grants, user premium_until, download log) and
 * a premium flag on poetry poems and media.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('membership_plans')) {
            Schema::create('membership_plans', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('slug', 120);
                $table->text('description')->nullable();
                $table->unsignedInteger('duration_value')->default(1);
                $table->string('duration_unit', 10)->default('month');
                $table->unsignedBigInteger('price_minor')->default(0);
                $table->unsignedBigInteger('sale_price_minor')->nullable();
                $table->string('currency', 8)->nullable();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->string('badge', 80)->nullable();
                $table->boolean('is_featured')->default(false);
                $table->boolean('is_active')->default(true);
                $table->unsignedInteger('sort')->default(0);
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'slug']);
            });
        }

        if (! Schema::hasTable('membership_grants')) {
            Schema::create('membership_grants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('plan_id')->nullable()->index();
                $table->unsignedBigInteger('order_id')->nullable()->index();
                $table->unsignedBigInteger('order_item_id')->nullable()->unique();
                $table->string('source', 20)->default('order');
                $table->unsignedInteger('duration_value');
                $table->string('duration_unit', 10);
                $table->timestamp('starts_at')->nullable();
                $table->timestamp('ends_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->string('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['tenant_id', 'user_id']);
            });
        }

        if (! Schema::hasTable('membership_downloads')) {
            Schema::create('membership_downloads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('media_id');
                $table->string('kind', 10);
                $table->timestamps();
                $table->unique(['user_id', 'media_id']);
                $table->index(['tenant_id', 'user_id', 'kind']);
            });
        }

        if (! Schema::hasColumn('users', 'premium_until')) {
            Schema::table('users', fn (Blueprint $table) => $table->timestamp('premium_until')->nullable());
        }
        foreach (['poetry_poems', 'poetry_media'] as $t) {
            if (Schema::hasTable($t) && ! Schema::hasColumn($t, 'is_premium')) {
                Schema::table($t, fn (Blueprint $table) => $table->boolean('is_premium')->default(false));
            }
        }
    }

    public function down(): void
    {
        foreach (['poetry_poems', 'poetry_media'] as $t) {
            if (Schema::hasTable($t) && Schema::hasColumn($t, 'is_premium')) {
                Schema::table($t, fn (Blueprint $table) => $table->dropColumn('is_premium'));
            }
        }
        if (Schema::hasColumn('users', 'premium_until')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn('premium_until'));
        }
        Schema::dropIfExists('membership_downloads');
        Schema::dropIfExists('membership_grants');
        Schema::dropIfExists('membership_plans');
    }
};
