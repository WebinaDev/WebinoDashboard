<?php

namespace App\Services\Resume;

use Illuminate\Support\Facades\DB;

/**
 * Loads a data.json-shaped payload (see docs/resume/README.md) into one tenant. Unknown keys are ignored; fields
 * are matched to schema columns (plain "title" fills title_fa when the column is bilingual). Idempotent only with
 * $replace=true (wipes the tenant's resume rows first); otherwise rows are appended.
 */
class ResumeImporter
{
    private const ALIASES = ['theme' => 'settings', 'profile' => 'identity'];

    /**
     * @param  string|null  $baseDir  when set, `*_path` keys (avatar_path, cutout_path → cover, cover_path, logo_path, gallery_paths)
     *                                 are read from files relative to it and stored in the tenant's media library.
     */
    public static function import(int $tenantId, array $payload, bool $replace = false, ?string $baseDir = null): array
    {
        if ($baseDir !== null) {
            $payload = self::attachFiles($tenantId, $payload, rtrim($baseDir, '/'));
        }
        $previous = ResumeScope::current();
        ResumeScope::set($tenantId);
        try {
            return DB::transaction(function () use ($payload, $replace, $tenantId) {
                $report = [];
                $sections = ResumeSchema::sections();
                $skillMap = [];
                // Skills first so experiences/projects can link by name.
                $keys = array_keys($payload);
                usort($keys, fn ($a, $b) => ($b === 'skills') <=> ($a === 'skills'));
                foreach ($keys as $key) {
                    $slug = self::ALIASES[$key] ?? $key;
                    if (! isset($sections[$slug]) || $key === '_meta') {
                        continue;
                    }
                    $class = ResumeSchema::model($slug);
                    $value = $payload[$key];
                    if ($slug === 'settings' && isset($value['key'])) {
                        $value['theme_key'] = $value['key'];
                    }
                    if ($sections[$slug]['single'] ?? false) {
                        $row = $class::query()->firstOrNew(['tenant_id' => $tenantId]);
                        $row->tenant_id = $tenantId;
                        $row->fill(self::map($slug, (array) $value, $skillMap))->save();
                        $report[$slug] = 1;

                        continue;
                    }
                    if ($replace) {
                        $class::query()->delete();
                    }
                    $n = 0;
                    foreach ((array) $value as $i => $item) {
                        if (! is_array($item)) {
                            continue;
                        }
                        $data = self::map($slug, $item, $skillMap);
                        $data['order'] = (int) ($item['order'] ?? $i);
                        $row = $class::query()->create($data);
                        if ($slug === 'skills') {
                            $skillMap[mb_strtolower((string) ($row->name_fa ?: $row->name_en))] = $row->id;
                            if ($row->name_en) {
                                $skillMap[mb_strtolower($row->name_en)] = $row->id;
                            }
                        }
                        $n++;
                    }
                    $report[$slug] = $n;
                }

                return $report;
            });
        } finally {
            ResumeScope::set($previous);
        }
    }

    private const PATH_KEYS = ['avatar_path' => 'avatar_media_id', 'cutout_path' => 'cover_media_id', 'cover_path' => 'cover_media_id',
        'logo_path' => 'company_logo_media_id', 'author_avatar_path' => 'avatar_media_id'];

    private static function attachFiles(int $tenantId, array $payload, string $base): array
    {
        $store = function (string $rel) use ($tenantId, $base): ?int {
            $file = realpath($base.'/'.$rel);
            if (! $file || ! str_starts_with($file, (string) realpath($base)) || ! is_file($file)) {
                return null;
            }
            $mime = (string) (mime_content_type($file) ?: 'application/octet-stream');
            if (! str_starts_with($mime, 'image/')) {
                return null;
            }
            $path = 'tenants/'.$tenantId.'/resume/'.sha1_file($file).'.'.strtolower(pathinfo($file, PATHINFO_EXTENSION) ?: 'png');
            \Illuminate\Support\Facades\Storage::disk('public')->put($path, (string) file_get_contents($file));
            $m = \App\Models\MediaAsset::query()->firstOrCreate(['tenant_id' => $tenantId, 'path' => $path],
                ['disk' => 'public', 'mime' => $mime, 'size' => filesize($file), 'original_name' => basename($file), 'title' => basename($file), 'folder' => 'resume']);

            return (int) $m->id;
        };
        $walk = function (array $item) use ($store): array {
            foreach (self::PATH_KEYS as $k => $col) {
                if (! empty($item[$k]) && is_string($item[$k]) && ($id = $store($item[$k]))) {
                    $item[$col] = $id;
                }
            }
            if (! empty($item['gallery_paths']) && is_array($item['gallery_paths'])) {
                $item['gallery_media_ids'] = array_values(array_filter(array_map(fn ($r) => is_string($r) ? $store($r) : null, $item['gallery_paths'])));
            }
            if (! empty($item['media_paths']) && is_array($item['media_paths'])) {
                $item['media_ids'] = array_values(array_filter(array_map(fn ($r) => is_string($r) ? $store($r) : null, $item['media_paths'])));
            }

            return $item;
        };
        foreach ($payload as $k => $v) {
            if (! is_array($v) || $k === '_meta') {
                continue;
            }
            $payload[$k] = array_is_list($v) ? array_map(fn ($i) => is_array($i) ? $walk($i) : $i, $v) : $walk($v);
        }

        return $payload;
    }

    private static function map(string $slug, array $item, array $skillMap): array
    {
        $out = ['is_placeholder' => (bool) ($item['is_placeholder'] ?? false)];
        $s = ResumeSchema::section($slug);
        if (! ($s['single'] ?? false) && isset($item['visibility']) && in_array($item['visibility'], ['public', 'hidden', 'private_link'], true)) {
            $out['visibility'] = $item['visibility'];
        }
        foreach ($s['fields'] as $f) {
            $k = $f['key'];
            if ($f['type'] === 'range') {
                $out['start'] = ResumeDate::normalize($item['start'] ?? null);
                $out['end'] = ResumeDate::normalize($item['end'] ?? null);
                $out['is_current'] = (bool) ($item['is_current'] ?? false);

                continue;
            }
            if ($f['type'] === 'skills') {
                $names = (array) ($item[$k] ?? $item['skills'] ?? []);
                $ids = [];
                foreach ($names as $n) {
                    $id = is_int($n) ? $n : ($skillMap[mb_strtolower((string) $n)] ?? null);
                    if ($id) {
                        $ids[] = $id;
                    }
                }
                $out[$k] = $ids;

                continue;
            }
            if ($f['i18n']) {
                $fa = $item[$k.'_fa'] ?? $item[$k] ?? null;
                $en = $item[$k.'_en'] ?? null;
                if ($fa !== null) {
                    $out[$k.'_fa'] = $fa;
                }
                if ($en !== null) {
                    $out[$k.'_en'] = $en;
                }

                continue;
            }
            if (array_key_exists($k, $item)) {
                $v = $item[$k];
                $out[$k] = $f['type'] === 'date' ? ResumeDate::normalize($v) : $v;
                if ($f['type'] === 'select' && ! in_array($v, $f['options'], true)) {
                    unset($out[$k]);
                }
            }
        }

        return $out;
    }
}
