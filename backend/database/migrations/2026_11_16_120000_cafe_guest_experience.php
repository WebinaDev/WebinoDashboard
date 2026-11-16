<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guest cafe experience: OTP verification for guest ordering, named product add-ons
 * (extras without a price), cooking services, and 3D/AR model assets.
 *
 * Additive and idempotent: every column/table is guarded with hasColumn/hasTable so a
 * partially migrated tenant database re-runs cleanly.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cafe_guest_verifications')) {
            Schema::create('cafe_guest_verifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                // Stable per-browser guest identity (the cart's guest_token).
                $table->string('guest_token', 64);
                $table->string('phone', 32);
                $table->timestamp('verified_at')->nullable();
                $table->timestamp('locked_until')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'guest_token']);
                $table->index(['tenant_id', 'phone']);
            });
        }

        if (! Schema::hasTable('cafe_guest_otps')) {
            Schema::create('cafe_guest_otps', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('guest_token', 64);
                $table->string('phone', 32);
                $table->string('code', 8);
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->timestamp('expires_at');
                $table->timestamps();
                $table->index(['tenant_id', 'guest_token', 'phone']);
            });
        }

        if (! Schema::hasTable('product_modifier_option_products')) {
            // Component choices: a modifier option that references another catalog item
            // (e.g. "سالاد سزار" as a side, "آیس لاته" as the drink of a combo).
            Schema::create('product_modifier_option_products', function (Blueprint $table) {
                $table->id();
                $table->foreignId('option_id')->constrained('product_modifier_options')->cascadeOnDelete();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->timestamps();
                $table->unique(['option_id', 'product_id']);
            });
        }

        if (! Schema::hasTable('product_gallery_views')) {
            // 3D / AR recordings for an item: glTF-model or a 360° turntable set.
            Schema::create('product_gallery_views', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->string('type', 16)->default('model3d'); // model3d | spin360
                $table->string('url');
                $table->string('poster_url')->nullable();
                $table->unsignedTinyInteger('frames')->default(0);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'product_id']);
            });
        }

        if (! Schema::hasColumn('carts', 'guest_phone')) {
            Schema::table('carts', function (Blueprint $table) {
                $table->string('guest_phone', 32)->nullable();
            });
        }

        Schema::table('products', function (Blueprint $table) {
            if (! Schema::hasColumn('products', 'has_service')) {
                $table->boolean('has_service')->default(false);
            }
            if (! Schema::hasColumn('products', 'service_label_fa')) {
                $table->string('service_label_fa')->nullable();
            }
            if (! Schema::hasColumn('products', 'service_label_en')) {
                $table->string('service_label_en')->nullable();
            }
            if (! Schema::hasColumn('products', 'daily_dish')) {
                // «غذای روز»: all weekdays this item is the dish of the day on, stored with
                // the same lowercase English keys as cafe hours (["monday","friday"]).
                $table->json('daily_dish')->nullable();
            }
        });

        Schema::table('product_modifier_options', function (Blueprint $table) {
            if (! Schema::hasColumn('product_modifier_options', 'is_addon')) {
                $table->boolean('is_addon')->default(false);
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'delivery_window')) {
                $table->string('delivery_window', 80)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'delivery_window')) {
                $table->dropColumn('delivery_window');
            }
        });

        Schema::table('carts', function (Blueprint $table) {
            if (Schema::hasColumn('carts', 'guest_phone')) {
                $table->dropColumn('guest_phone');
            }
        });

        Schema::table('product_modifier_options', function (Blueprint $table) {
            if (Schema::hasColumn('product_modifier_options', 'is_addon')) {
                $table->dropColumn('is_addon');
            }
        });

        Schema::table('products', function (Blueprint $table) {
            $drop = [];
            foreach (['has_service', 'service_label_fa', 'service_label_en', 'daily_dish'] as $column) {
                if (Schema::hasColumn('products', $column)) {
                    $drop[] = $column;
                }
            }
            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });

        Schema::dropIfExists('product_gallery_views');
        Schema::dropIfExists('product_modifier_option_products');
        Schema::dropIfExists('cafe_guest_otps');
        Schema::dropIfExists('cafe_guest_verifications');
    }
};
