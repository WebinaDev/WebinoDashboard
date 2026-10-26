<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Publications: list of action links ({label_fa, label_en, url}), e.g. buy / read buttons for a book. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('resume_publications', 'links')) {
            Schema::table('resume_publications', fn (Blueprint $t) => $t->json('links')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('resume_publications', 'links')) {
            Schema::table('resume_publications', fn (Blueprint $t) => $t->dropColumn('links'));
        }
    }
};
