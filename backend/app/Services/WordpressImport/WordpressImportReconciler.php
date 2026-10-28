<?php

namespace App\Services\WordpressImport;

use App\Models\Product;
use App\Models\WordpressImportItem;
use App\Models\WordpressImportJob;
use App\Models\WordpressImportLink;
use InvalidArgumentException;

/**
 * Compares a source product list (the job's own items, or a WooCommerce JSON export)
 * with what was actually imported, explains why each missing product is missing,
 * and can re-queue the missing ones on the job.
 */
final class WordpressImportReconciler
{
    public function __construct(private readonly WordpressImportRunner $runner) {}

    /**
     * Load products from a WooCommerce export: a JSON file or a directory of JSON files.
     * Accepts REST-style rows (id, images[].src, categories[].id, variations as objects or ids
     * resolved from a variations*.json file) as well as importer-shaped rows.
     *
     * @return list<array<string, mixed>>
     */
    public function loadSource(string $path): array
    {
        $files = is_dir($path) ? (glob(rtrim($path, '/').'/*.json') ?: []) : [$path];
        if ($files === [] || (! is_dir($path) && ! is_file($path))) {
            throw new InvalidArgumentException('Export source not found: '.$path);
        }
        $products = [];
        $variations = [];
        foreach ($files as $file) {
            $name = strtolower(basename($file));
            $isVariations = str_contains($name, 'variation');
            $isProducts = str_contains($name, 'product') || ! is_dir($path);
            if (! $isVariations && ! $isProducts) {
                continue;
            }
            $data = json_decode((string) file_get_contents($file), true);
            if (! is_array($data)) {
                continue;
            }
            if (! array_is_list($data)) {
                if ($isVariations && ! isset($data['variations'])) {
                    // {"<parent id>": [variation, ...]}
                    foreach ($data as $parent => $rows) {
                        foreach (is_array($rows) ? $rows : [] as $v) {
                            if (is_array($v)) {
                                $variations[(string) ($v['parent_id'] ?? $parent)][] = $v;
                            }
                        }
                    }

                    continue;
                }
                $data = $data[$isVariations ? 'variations' : 'products'] ?? $data['items'] ?? [];
            }
            foreach ($data as $row) {
                if (! is_array($row)) {
                    continue;
                }
                if ($isVariations || (($row['type'] ?? '') === 'variation' && isset($row['parent_id']))) {
                    $variations[(string) ($row['parent_id'] ?? '')][] = $row;
                } else {
                    $products[] = $row;
                }
            }
        }

        return array_values(array_filter(array_map(
            fn (array $row) => $this->normalize($row, $variations),
            $products
        ), fn (array $row) => ($row['external_id'] ?? '') !== ''));
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<string, list<array<string, mixed>>>  $variations
     * @return array<string, mixed>
     */
    public function normalize(array $row, array $variations = []): array
    {
        $id = trim((string) ($row['external_id'] ?? $row['source_id'] ?? $row['id'] ?? ''));
        $row['external_id'] = $id;
        $row = $this->fromStoreApi($row);
        if (! isset($row['source_guid']) && isset($row['permalink'])) {
            $row['source_guid'] = (string) $row['permalink'];
        }
        $images = [];
        foreach (is_array($row['images'] ?? null) ? $row['images'] : [] as $i => $image) {
            if (is_array($image) && ! isset($image['url']) && isset($image['src'])) {
                $image = ['url' => (string) $image['src'], 'alt' => $image['alt'] ?? null, 'title' => $image['name'] ?? null, 'external_id' => isset($image['id']) ? (string) $image['id'] : null];
            }
            $images[] = $image;
        }
        if ($images !== []) {
            $row['images'] = $images;
        }
        foreach (['categories' => 'category_external_ids', 'tags' => 'tag_external_ids'] as $from => $to) {
            if (! isset($row[$to]) && is_array($row[$from] ?? null)) {
                $row[$to] = array_values(array_filter(array_map(
                    fn ($t) => is_array($t) ? (string) ($t['id'] ?? '') : (is_scalar($t) ? (string) $t : ''),
                    $row[$from]
                )));
            }
        }
        $list = is_array($row['variations'] ?? null) ? $row['variations'] : [];
        $byId = [];
        foreach ($variations[$id] ?? [] as $v) {
            $byId[(string) ($v['id'] ?? count($byId))] = $v;
        }
        $resolved = [];
        foreach ($list === [] ? array_values($byId) : $list as $v) {
            if (is_scalar($v)) {
                $v = $byId[(string) $v] ?? null;
            }
            if (! is_array($v)) {
                continue;
            }
            $v['external_id'] ??= isset($v['id']) ? (string) $v['id'] : null;
            $v = $this->fromStoreApi($v);
            if (is_array($v['image'] ?? null) && array_is_list($v['image'])) {
                $v['image'] = $v['image'][0] ?? null;
            }
            if (! isset($v['image_url']) && is_array($v['image'] ?? null) && isset($v['image']['src'])) {
                $v['image_url'] = (string) $v['image']['src'];
                unset($v['image']);
            }
            $resolved[] = $v;
        }
        $row['variations'] = $resolved;

        return $row;
    }

    /**
     * @param  list<array<string, mixed>>|null  $source  null = use the job's own product items
     * @return array{source: int, imported: int, missing: list<array{external_id: string, name: string, reason: string}>}
     */
    public function report(WordpressImportJob $job, ?array $source = null): array
    {
        $items = WordpressImportItem::query()->where('job_id', $job->id)->where('resource', 'products')
            ->get(['external_id', 'status', 'action', 'message', 'payload'])->keyBy('external_id');
        $rows = $source ?? $items->map(fn ($i) => (array) $i->payload + ['external_id' => $i->external_id])->values()->all();
        $linked = WordpressImportLink::query()->where('tenant_id', $job->tenant_id)->where('resource', 'products')
            ->pluck('local_id', 'external_id');
        $existing = Product::query()->where('tenant_id', $job->tenant_id)->whereIn('id', $linked->values())->pluck('status', 'id');
        $missing = [];
        foreach ($rows as $row) {
            $id = (string) ($row['external_id'] ?? '');
            if ($id === '') {
                continue;
            }
            $local = $linked[$id] ?? null;
            $publishedAtSource = strtolower((string) ($row['status'] ?? 'publish')) === 'publish';
            $trashed = $local !== null && ($existing[$local] ?? null) === 'trash';
            if ($local !== null && isset($existing[$local]) && ! ($trashed && $publishedAtSource)) {
                continue;
            }
            $missing[] = [
                'external_id' => $id,
                'name' => mb_substr(trim(html_entity_decode((string) ($row['name'] ?? $row['title'] ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8')), 0, 120),
                'reason' => $trashed ? 'imported product is in trash locally but published at source' : $this->reason($row, $items[$id] ?? null, $local !== null),
            ];
        }

        return ['source' => count($rows), 'imported' => count($rows) - count($missing), 'missing' => $missing];
    }

    /** @param  array<string, mixed>  $row */
    private function reason(array $row, ?WordpressImportItem $item, bool $linkedButDeleted): string
    {
        $hints = [];
        if ($linkedButDeleted) {
            $hints[] = 'imported product was deleted locally';
        }
        if ($item) {
            $hints[] = match ($item->status) {
                'failed' => 'failed: '.mb_substr((string) $item->message, 0, 300),
                'skipped' => 'skipped: '.mb_substr((string) ($item->message ?: 'resource not selected'), 0, 300),
                'pending' => 'still pending in the job',
                default => 'item '.$item->status.' but no product link',
            };
        } else {
            $hints[] = 'not in the import job (exporter did not send it)';
        }
        $status = strtolower((string) ($row['status'] ?? 'publish'));
        if ($status !== 'publish') {
            $hints[] = 'source status '.$status;
        }
        $type = strtolower((string) ($row['type'] ?? 'simple'));
        if (! in_array($type, ['simple', 'variable'], true)) {
            $hints[] = 'type '.$type;
        }
        if (trim((string) ($row['sku'] ?? '')) === '') {
            $hints[] = 'no SKU';
        }
        if (trim((string) ($row['name'] ?? $row['title'] ?? '')) === '') {
            $hints[] = 'no name';
        }
        if (($row['catalog_visibility'] ?? 'visible') === 'hidden') {
            $hints[] = 'catalog visibility hidden';
        }

        return implode('; ', $hints);
    }

    /**
     * Re-queue the missing products (from the source rows, or the job's items) as pending.
     *
     * @param  list<array{external_id: string}>  $missing
     * @param  list<array<string, mixed>>|null  $source
     */
    public function requeue(WordpressImportJob $job, array $missing, ?array $source = null): int
    {
        $ids = array_column($missing, 'external_id');
        if ($ids === []) {
            return 0;
        }
        if ($source === null) {
            $source = WordpressImportItem::query()->where('job_id', $job->id)->where('resource', 'products')
                ->whereIn('external_id', $ids)->get()->map(fn ($i) => (array) $i->payload + ['external_id' => $i->external_id])->all();
        }
        $rows = array_values(array_filter($source, fn ($r) => in_array((string) ($r['external_id'] ?? ''), $ids, true)));
        if ($rows === []) {
            return 0;
        }
        $this->runner->enqueue($job, ['products' => $rows]);

        return count($rows);
    }

    /** Map WooCommerce Store API fields (prices{}, stock{}) to the REST shape the importer reads. */
    private function fromStoreApi(array $row): array
    {
        $prices = $row['prices'] ?? null;
        if (is_array($prices) && ! isset($row['regular_price'])) {
            $unit = max(0, (int) ($prices['currency_minor_unit'] ?? 0));
            $major = function ($v) use ($unit) {
                if ($v === null || $v === '' || ! is_numeric($v)) {
                    return '';
                }

                return $unit > 0 ? (string) round(((float) $v) / (10 ** $unit), $unit) : (string) $v;
            };
            $row['regular_price'] = $major($prices['regular_price'] ?? $prices['price'] ?? null);
            $sale = $major($prices['sale_price'] ?? null);
            $row['sale_price'] = $sale !== '' && $sale !== $row['regular_price'] ? $sale : '';
            $row['price'] = $major($prices['price'] ?? null);
            if (! empty($prices['currency_code'])) {
                $row['currency'] ??= (string) $prices['currency_code'];
            }
        }
        if (! isset($row['stock_status'])) {
            $inStock = $row['is_in_stock'] ?? (is_array($row['stock'] ?? null) ? ($row['stock']['is_in_stock'] ?? null) : null);
            if ($inStock !== null) {
                $row['stock_status'] = $inStock ? 'instock' : 'outofstock';
            }
        }

        return $row;
    }
}
