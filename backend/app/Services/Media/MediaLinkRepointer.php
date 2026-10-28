<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * After an image is converted to WebP, point stored references (product images, post bodies, builder
 * documents, settings...) at the new file so the WebP is what actually gets served. Originals stay on
 * disk, so anything this misses keeps working. Tenant-scoped; matches the storage path itself, plain
 * and JSON-escaped ("media\/1\/a.jpg"), so it covers absolute URLs, /storage/ paths and JSON columns.
 */
class MediaLinkRepointer
{
    /** Tables that hold media references (scanned only when they exist and have tenant_id). */
    public const TABLES = [
        'products', 'product_variants', 'categories', 'brands', 'blog_posts', 'blog_categories',
        'cms_pages', 'builder_globals', 'builder_templates', 'sliders', 'banners', 'stories',
        'marketing_popups', 'nav_menus', 'tenant_settings', 'settings',
    ];

    private const TEXT_TYPES = ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext', 'json', 'jsonb', 'string'];

    /** @var array<string, list<string>> */
    private array $columns = [];

    /** @return int rows updated */
    public function repoint(int $tenantId, string $oldPath, string $newPath, bool $dryRun = false): int
    {
        $oldPath = ltrim($oldPath, '/');
        $newPath = ltrim($newPath, '/');
        if ($oldPath === '' || $oldPath === $newPath || $tenantId < 1) {
            return 0;
        }
        $pairs = [[$oldPath, $newPath]];
        $escOld = str_replace('/', '\\/', $oldPath);
        if ($escOld !== $oldPath) {
            $pairs[] = [$escOld, str_replace('/', '\\/', $newPath)];
        }
        $rows = 0;
        foreach (self::TABLES as $table) {
            foreach ($this->textColumns($table) as $col) {
                foreach ($pairs as [$from, $to]) {
                    $q = DB::table($table)->where('tenant_id', $tenantId)->where($col, 'like', '%'.addcslashes($from, '%_\\').'%');
                    if ($dryRun) {
                        $rows += $q->count();

                        continue;
                    }
                    $rows += $q->update([$col => DB::raw('REPLACE('.DB::getQueryGrammar()->wrap($col).', '.DB::getPdo()->quote($from).', '.DB::getPdo()->quote($to).')')]);
                }
            }
        }

        return $rows;
    }

    /** @return list<string> */
    private function textColumns(string $table): array
    {
        if (array_key_exists($table, $this->columns)) {
            return $this->columns[$table];
        }
        $cols = [];
        try {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'tenant_id')) {
                foreach (Schema::getColumns($table) as $c) {
                    $type = strtolower((string) ($c['type_name'] ?? ''));
                    if (in_array($type, self::TEXT_TYPES, true) && ! in_array($c['name'], ['slug', 'status', 'password', 'remember_token'], true)) {
                        $cols[] = (string) $c['name'];
                    }
                }
            }
        } catch (\Throwable) {
            $cols = [];
        }

        return $this->columns[$table] = $cols;
    }
}
