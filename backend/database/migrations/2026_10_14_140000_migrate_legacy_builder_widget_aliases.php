<?php

use App\Support\BuilderWidgetAliases;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Data-only migration: checkout-stub -> checkout, account-stub -> account in saved builder documents.
 * Idempotent; rows without legacy aliases are not written. The renderer keeps accepting the
 * old aliases, so down() is a no-op.
 */
return new class extends Migration
{
    public function up(): void
    {
        $targets = [
            'cms_pages' => ['builder_draft', 'builder_published'],
            'builder_templates' => ['draft', 'published'],
        ];
        foreach ($targets as $table => $columns) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            $columns = array_values(array_filter($columns, fn ($c) => Schema::hasColumn($table, $c)));
            if ($columns === []) {
                continue;
            }
            DB::table($table)->select(array_merge(['id'], $columns))->orderBy('id')->chunkById(200, function ($rows) use ($table, $columns) {
                foreach ($rows as $row) {
                    $update = [];
                    foreach ($columns as $column) {
                        $raw = $row->{$column};
                        if (! is_string($raw) || (! str_contains($raw, 'checkout-stub') && ! str_contains($raw, 'account-stub'))) {
                            continue;
                        }
                        $decoded = json_decode($raw, true);
                        if (! is_array($decoded)) {
                            continue;
                        }
                        [$migrated, $count] = BuilderWidgetAliases::migrate($decoded);
                        if ($count > 0) {
                            $update[$column] = json_encode($migrated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        }
                    }
                    if ($update !== []) {
                        DB::table($table)->where('id', $row->id)->update($update);
                    }
                }
            });
        }
    }

    public function down(): void {}
};
