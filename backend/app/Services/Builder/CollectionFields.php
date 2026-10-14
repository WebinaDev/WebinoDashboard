<?php

namespace App\Services\Builder;

use App\Models\BuilderCollection;
use App\Models\BuilderCollectionItem;

/**
 * Field schema + value sanitising for CMS collections. Every stored value is a string:
 * bool = "1"/"", lists (gallery, multi_reference) = newline-separated, references = item slugs.
 */
final class CollectionFields
{
    public const TYPES = ['text', 'textarea', 'richtext', 'image', 'url', 'number', 'date', 'bool', 'select', 'color', 'email', 'gallery', 'file', 'reference', 'multi_reference'];

    public const SCHEMA_TYPES = ['Thing', 'Article', 'CreativeWork', 'Event', 'Person', 'Place', 'Product', 'Service', 'Organization', 'Course', 'JobPosting'];

    private const URL = '#^(https://|/(?!/))[^\s"<>]*$#';

    /**
     * @param  list<array<string, mixed>>  $fields
     * @return list<array<string, mixed>>
     */
    public static function normalizeFields(array $fields, string $ownSlug = ''): array
    {
        $out = [];
        foreach ($fields as $f) {
            $row = ['key' => (string) $f['key'], 'label' => strip_tags((string) $f['label']), 'type' => (string) $f['type']];
            if ($row['type'] === 'select') {
                $row['options'] = implode("\n", self::options((string) ($f['options'] ?? '')));
            }
            if (in_array($row['type'], ['reference', 'multi_reference'], true)) {
                $target = preg_replace('/[^a-z0-9\-_]/', '', mb_strtolower((string) ($f['collection'] ?? '')));
                $row['collection'] = $target !== '' ? $target : $ownSlug;
            }
            $out[$row['key']] = $row;
        }

        return array_values($out);
    }

    /** @return list<string> */
    public static function options(string $raw): array
    {
        $items = array_map(fn ($v) => mb_substr(trim(strip_tags($v)), 0, 80), preg_split('/[\n,،]+/u', $raw) ?: []);

        return array_slice(array_values(array_unique(array_filter($items, fn ($v) => $v !== ''))), 0, 50);
    }

    /** @return list<string> */
    public static function slugList(string $raw): array
    {
        $slugs = array_filter(array_map('trim', preg_split('/[\n,،]+/u', $raw) ?: []), fn ($s) => preg_match('/^[\p{L}\p{N}_\-]{1,120}$/u', $s) === 1);

        return array_slice(array_values(array_unique($slugs)), 0, 20);
    }

    /**
     * Keeps only declared fields with type-valid values.
     *
     * @param  list<array<string, mixed>>  $fields
     * @param  array<string, mixed>  $data
     * @return array<string, string>
     */
    public static function cleanData(array $fields, array $data): array
    {
        $out = [];
        foreach ($fields as $field) {
            $raw = $data[$field['key']] ?? null;
            if (is_array($raw) && in_array($field['type'], ['gallery', 'multi_reference'], true)) {
                $raw = implode("\n", array_filter($raw, 'is_scalar'));
            }
            if (is_bool($raw)) {
                $raw = $raw ? '1' : '';
            }
            if ($raw === null || is_array($raw)) {
                continue;
            }
            $value = self::clean($field, trim((string) $raw));
            if ($value !== null) {
                $out[$field['key']] = $value;
            }
        }

        return $out;
    }

    /** @param  array<string, mixed>  $field */
    private static function clean(array $field, string $value): ?string
    {
        if ($value === '') {
            return $field['type'] === 'bool' ? '' : '';
        }

        return match ($field['type']) {
            'image', 'url', 'file' => preg_match(self::URL, $value) ? mb_substr($value, 0, 2000) : null,
            'number' => is_numeric($value) ? $value : null,
            'date' => preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/', $value) ? $value : null,
            'bool' => in_array(mb_strtolower($value), ['1', 'true', 'yes', 'on', 'بله'], true) ? '1' : '',
            'select' => in_array($value, self::options((string) ($field['options'] ?? '')), true) ? $value : null,
            'color' => preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $value) ? strtolower($value) : null,
            'email' => filter_var($value, FILTER_VALIDATE_EMAIL) ? mb_substr($value, 0, 200) : null,
            'gallery' => implode("\n", array_slice(array_values(array_filter(array_map('trim', preg_split('/\s*[\n,]\s*/', $value) ?: []), fn ($u) => preg_match(self::URL, $u) === 1)), 0, 30)),
            'reference' => self::slugList($value)[0] ?? null,
            'multi_reference' => implode("\n", self::slugList($value)),
            'richtext' => mb_substr($value, 0, 20000),
            default => mb_substr(strip_tags($value), 0, 5000),
        };
    }

    /** @return array<string, string>|null */
    public static function normalizeCollectionSeo(mixed $seo): ?array
    {
        if (! is_array($seo)) {
            return null;
        }
        $out = array_filter([
            'title_template' => mb_substr(strip_tags((string) ($seo['title_template'] ?? '')), 0, 200),
            'description_field' => preg_replace('/[^a-z0-9_]/', '', (string) ($seo['description_field'] ?? '')),
            'image_field' => preg_replace('/[^a-z0-9_]/', '', (string) ($seo['image_field'] ?? '')),
            'schema_type' => in_array($seo['schema_type'] ?? null, self::SCHEMA_TYPES, true) ? (string) $seo['schema_type'] : '',
        ], fn ($v) => $v !== '');

        return $out === [] ? null : $out;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeItemSeo(mixed $seo): ?array
    {
        if (! is_array($seo)) {
            return null;
        }
        $image = trim((string) ($seo['image'] ?? ''));
        $out = array_filter([
            'title' => mb_substr(strip_tags((string) ($seo['title'] ?? '')), 0, 200),
            'description' => mb_substr(strip_tags((string) ($seo['description'] ?? '')), 0, 400),
            'image' => $image !== '' && preg_match(self::URL, $image) ? $image : '',
            'noindex' => ! empty($seo['noindex']),
        ], fn ($v) => $v !== '' && $v !== false);

        return $out === [] ? null : $out;
    }

    /**
     * Effective SEO for an item page: item overrides → collection template/fields → defaults.
     *
     * @return array{title:string,description:string,image:?string,noindex:bool,schema_type:string}
     */
    public static function resolveSeo(BuilderCollection $collection, BuilderCollectionItem $item): array
    {
        $cs = $collection->seo ?? [];
        $is = $item->seo ?? [];
        $data = $item->data ?? [];
        $template = (string) ($cs['title_template'] ?? '');
        $title = (string) ($is['title'] ?? '') ?: ($template !== '' ? str_replace(['{title}', '{collection}'], [$item->title, $collection->name], $template) : $item->title);
        $descField = (string) ($cs['description_field'] ?? '');
        $description = (string) ($is['description'] ?? '') ?: ($descField !== '' ? mb_substr(trim(strip_tags((string) ($data[$descField] ?? ''))), 0, 300) : '');
        if ($description === '') {
            foreach ($collection->fields ?? [] as $f) {
                if (in_array($f['type'], ['textarea', 'text', 'richtext'], true) && ! empty($data[$f['key']])) {
                    $description = mb_substr(trim(preg_replace('/\s+/u', ' ', strip_tags((string) $data[$f['key']]))), 0, 300);
                    break;
                }
            }
        }
        $imageField = (string) ($cs['image_field'] ?? '');
        $image = (string) ($is['image'] ?? '') ?: ($imageField !== '' ? (string) ($data[$imageField] ?? '') : '');
        if ($image === '') {
            foreach ($collection->fields ?? [] as $f) {
                if ($f['type'] === 'image' && ! empty($data[$f['key']])) {
                    $image = (string) $data[$f['key']];
                    break;
                }
            }
        }

        return ['title' => $title, 'description' => $description, 'image' => $image !== '' ? $image : null, 'noindex' => ! empty($is['noindex']), 'schema_type' => (string) ($cs['schema_type'] ?? 'Thing')];
    }

    /** Neutralises spreadsheet formula injection in exported cells. */
    public static function csvSafe(string $value): string
    {
        return $value !== '' && in_array($value[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'".$value : $value;
    }
}
