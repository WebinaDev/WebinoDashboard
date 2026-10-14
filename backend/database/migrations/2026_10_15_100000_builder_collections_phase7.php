<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Phase 7: per-collection SEO defaults and per-item SEO overrides (nullable, additive). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('builder_collections', 'seo')) {
            Schema::table('builder_collections', fn (Blueprint $t) => $t->json('seo')->nullable());
        }
        if (! Schema::hasColumn('builder_collection_items', 'seo')) {
            Schema::table('builder_collection_items', fn (Blueprint $t) => $t->json('seo')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('builder_collection_items', 'seo')) {
            Schema::table('builder_collection_items', fn (Blueprint $t) => $t->dropColumn('seo'));
        }
        if (Schema::hasColumn('builder_collections', 'seo')) {
            Schema::table('builder_collections', fn (Blueprint $t) => $t->dropColumn('seo'));
        }
    }
};
