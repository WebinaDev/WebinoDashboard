<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('acc_journal_entries', function (Blueprint $table) {
            if (! Schema::hasColumn('acc_journal_entries', 'status')) {
                $table->string('status', 20)->default('draft')->after('description');
            }
        });
    }

    public function down(): void
    {
        Schema::table('acc_journal_entries', function (Blueprint $table) {
            if (Schema::hasColumn('acc_journal_entries', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
