<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        DB::table('dashboard_modules')->upsert(
            [
                [
                    'slug' => 'modules',
                    'git_repo' => null,
                    'default_version' => '0.1.0',
                    'requires_license' => false,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            ],
            ['slug'],
            ['git_repo', 'default_version', 'requires_license', 'updated_at']
        );
    }

    public function down(): void
    {
        DB::table('dashboard_modules')->where('slug', 'modules')->delete();
    }
};
