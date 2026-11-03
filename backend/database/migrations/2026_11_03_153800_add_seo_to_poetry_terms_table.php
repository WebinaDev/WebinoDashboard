<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** SEO JSON on poetry taxonomies — mirrors blog/product category pattern. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('poetry_terms')) {
            return;
        }
        Schema::table('poetry_terms', function (Blueprint $t) {
            if (! Schema::hasColumn('poetry_terms', 'seo')) {
                $t->json('seo')->nullable()->after('image');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('poetry_terms') || ! Schema::hasColumn('poetry_terms', 'seo')) {
            return;
        }
        Schema::table('poetry_terms', function (Blueprint $t) {
            $t->dropColumn('seo');
        });
    }
};
