<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_price_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('price_minor');
            $table->unsignedBigInteger('sale_price_minor')->nullable();
            $table->timestamp('recorded_at');
            $table->index(['tenant_id', 'product_id', 'recorded_at']);
        });

        Schema::create('product_stock_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_token', 64)->nullable();
            $table->string('channel', 16)->default('email');
            $table->string('destination', 190);
            $table->string('alert_type', 32);
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'product_id', 'alert_type', 'destination'], 'stock_alert_unique');
        });

        Schema::create('product_stories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('media_url');
            $table->string('media_type', 16)->default('image');
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('link_url')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('product_compare_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_token', 64)->nullable();
            $table->json('product_ids');
            $table->timestamps();
            $table->unique(['tenant_id', 'user_id']);
            $table->unique(['tenant_id', 'guest_token']);
        });

        Schema::create('polls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->json('options');
            $table->boolean('is_active')->default(true);
            $table->timestamp('closes_at')->nullable();
            $table->timestamps();
        });

        Schema::create('poll_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_token', 64)->nullable();
            $table->unsignedTinyInteger('option_index');
            $table->timestamp('created_at');
            $table->unique(['poll_id', 'user_id']);
            $table->unique(['poll_id', 'guest_token']);
        });

        Schema::create('vendor_stores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug')->index();
            $table->text('bio')->nullable();
            $table->string('logo_url')->nullable();
            $table->string('status', 32)->default('pending');
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
            $table->unique(['tenant_id', 'user_id']);
        });

        Schema::create('vendor_withdrawals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_store_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('amount_minor');
            $table->string('currency', 8)->default('IRT');
            $table->string('status', 32)->default('pending');
            $table->string('bank_sheba', 34)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::table('products', function (Blueprint $table) {
            if (! Schema::hasColumn('products', 'vendor_store_id')) {
                $table->foreignId('vendor_store_id')->nullable()->after('tenant_id')->constrained('vendor_stores')->nullOnDelete();
            }
            if (! Schema::hasColumn('products', 'price_updated_at')) {
                $table->timestamp('price_updated_at')->nullable()->after('sale_price_minor');
            }
        });

        Schema::table('product_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('product_reviews', 'voice_path')) {
                $table->string('voice_path')->nullable()->after('body');
            }
            if (! Schema::hasColumn('product_reviews', 'likes_count')) {
                $table->unsignedInteger('likes_count')->default(0)->after('status');
            }
            if (! Schema::hasColumn('product_reviews', 'dislikes_count')) {
                $table->unsignedInteger('dislikes_count')->default(0)->after('likes_count');
            }
        });

        Schema::create('product_review_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('review_id')->constrained('product_reviews')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_token', 64)->nullable();
            $table->string('reaction', 8);
            $table->timestamps();
            $table->unique(['review_id', 'user_id']);
            $table->unique(['review_id', 'guest_token']);
        });

        Schema::create('product_review_abuse_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('review_id')->constrained('product_reviews')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reason', 500)->nullable();
            $table->timestamp('created_at');
        });

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'wishlist_public_token')) {
                $table->string('wishlist_public_token', 64)->nullable()->unique()->after('wishlist');
            }
            if (! Schema::hasColumn('users', 'wishlist_public_enabled')) {
                $table->boolean('wishlist_public_enabled')->default(false)->after('wishlist_public_token');
            }
            if (! Schema::hasColumn('users', 'kyc_status')) {
                $table->string('kyc_status', 32)->nullable()->after('national_id');
            }
            if (! Schema::hasColumn('users', 'kyc_verified_at')) {
                $table->timestamp('kyc_verified_at')->nullable()->after('kyc_status');
            }
        });

        Schema::table('support_ticket_replies', function (Blueprint $table) {
            if (! Schema::hasColumn('support_ticket_replies', 'attachments')) {
                $table->json('attachments')->nullable()->after('body');
            }
        });
    }

    public function down(): void
    {
        Schema::table('support_ticket_replies', function (Blueprint $table) {
            if (Schema::hasColumn('support_ticket_replies', 'attachments')) {
                $table->dropColumn('attachments');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            foreach (['kyc_verified_at', 'kyc_status', 'wishlist_public_enabled', 'wishlist_public_token'] as $col) {
                if (Schema::hasColumn('users', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::dropIfExists('product_review_abuse_reports');
        Schema::dropIfExists('product_review_reactions');
        Schema::table('product_reviews', function (Blueprint $table) {
            foreach (['dislikes_count', 'likes_count', 'voice_path'] as $col) {
                if (Schema::hasColumn('product_reviews', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::table('products', function (Blueprint $table) {
            if (Schema::hasColumn('products', 'vendor_store_id')) {
                $table->dropConstrainedForeignId('vendor_store_id');
            }
            if (Schema::hasColumn('products', 'price_updated_at')) {
                $table->dropColumn('price_updated_at');
            }
        });

        Schema::dropIfExists('vendor_withdrawals');
        Schema::dropIfExists('vendor_stores');
        Schema::dropIfExists('poll_votes');
        Schema::dropIfExists('polls');
        Schema::dropIfExists('product_compare_sessions');
        Schema::dropIfExists('product_stories');
        Schema::dropIfExists('product_stock_alerts');
        Schema::dropIfExists('product_price_histories');
    }
};
