<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['brands', 'categories', 'product_tags', 'blog_categories', 'magazine_categories'] as $table) {
            if (Schema::hasTable($table) && ! Schema::hasColumn($table, 'status')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->string('status', 24)->default('publish')->index();
                });
            }
        }

        foreach (['product_tags', 'blog_categories', 'magazine_categories', 'blog_posts', 'cms_pages', 'magazine_articles'] as $table) {
            if (Schema::hasTable($table) && ! Schema::hasColumn($table, 'meta')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->json('meta')->nullable();
                });
            }
        }

        if (Schema::hasTable('blog_posts') && ! Schema::hasColumn('blog_posts', 'builder_published')) {
            Schema::table('blog_posts', function (Blueprint $blueprint) {
                $blueprint->json('builder_published')->nullable();
            });
        }

        if (Schema::hasTable('tenant_submodule_activations') && Schema::hasTable('tenants') && Schema::hasColumn('tenants', 'site_type_slug')) {
            $ids = DB::table('tenants')
                ->where(function ($q) {
                    $q->whereNull('site_type_slug')->orWhere('site_type_slug', '!=', 'coffee');
                })
                ->pluck('id');
            if ($ids->isNotEmpty()) {
                DB::table('tenant_submodule_activations')
                    ->where('module_slug', 'coffee-profile')
                    ->whereIn('tenant_id', $ids)
                    ->update(['enabled' => false]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('blog_posts') && Schema::hasColumn('blog_posts', 'builder_published')) {
            Schema::table('blog_posts', function (Blueprint $blueprint) {
                $blueprint->dropColumn('builder_published');
            });
        }
    }
};
