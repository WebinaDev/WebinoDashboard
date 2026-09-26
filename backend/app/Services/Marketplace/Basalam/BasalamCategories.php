<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\Category;
use App\Models\Product;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Basalam categories (port of CategoryMapping, CategoryOptions, GetCategoryId, GetCategoryAttr,
 * CategoryPreparationService and CategoryService): tree, title detection, attributes, preparation
 * caps, local→Basalam category mappings and attribute-name option maps.
 */
class BasalamCategories
{
    public const MAPPINGS = 'basalam_category_mappings';

    public const OPTION_MAPS = 'basalam_option_maps';

    /** @var array<string, list<int>> */
    protected array $resolved = [];

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    /** @return list<array{id: int, name: string, parent_id: null, children: list<mixed>}> Cached one day. */
    public function tree(bool $refresh = false): array
    {
        $key = 'marketplace:basalam:categories';
        if ($refresh) {
            Cache::forget($key);
        }
        $cached = Cache::get($key);
        if (is_array($cached) && $cached !== []) {
            return $cached;
        }
        $body = $this->client->get(BasalamEndpoints::CATEGORIES);
        if (! isset($body['data']) || ! is_array($body['data'])) {
            throw new MarketplaceException(__('marketplace.basalam_categories_invalid'), 502);
        }
        $tree = self::formatTree($body['data']);
        Cache::put($key, $tree, 86400);

        return $tree;
    }

    /** @param  array<mixed>  $nodes */
    public static function formatTree(array $nodes): array
    {
        $out = [];
        foreach ($nodes as $node) {
            if (! is_array($node) || ! isset($node['id'], $node['title'])) {
                continue;
            }
            $out[] = [
                'id' => (int) $node['id'],
                'name' => (string) $node['title'],
                'parent_id' => null,
                'children' => is_array($node['children'] ?? null) ? self::formatTree($node['children']) : [],
            ];
        }

        return $out;
    }

    /**
     * Title-based prediction. `$all` returns every candidate with its level1→leaf ids and joined title.
     *
     * @return list<int>|list<array{cat_id: list<int>, cat_title: string}>
     */
    public function detect(string $title, bool $all = false): array
    {
        $title = mb_substr(trim($title), 0, 120);
        if ($title === '') {
            return [];
        }
        $body = $this->client->get(BasalamEndpoints::CATEGORY_DETECT, ['title' => $title]);
        $result = is_array($body['result'] ?? null) ? array_values($body['result']) : [];
        if ($result === []) {
            return [];
        }
        if (! $all) {
            return self::chainIds($result[0]);
        }

        return array_map(fn ($c) => ['cat_id' => self::chainIds($c), 'cat_title' => self::chainTitle($c)], array_filter($result, 'is_array'));
    }

    /** @param  array<string, mixed>  $node */
    public static function chainIds(array $node): array
    {
        $ids = [];
        $cur = $node;
        while (is_array($cur)) {
            $ids[] = (int) ($cur['cat_id'] ?? 0);
            $cur = $cur['cat_parent'] ?? null;
        }

        return array_values(array_filter(array_reverse($ids)));
    }

    /** @param  array<string, mixed>  $node */
    public static function chainTitle(array $node): string
    {
        $titles = [];
        $cur = $node;
        while (is_array($cur)) {
            $titles[] = (string) ($cur['cat_title'] ?? '');
            $cur = $cur['cat_parent'] ?? null;
        }

        return implode(' > ', array_reverse($titles));
    }

    /** First prediction shaped for the UI (REST categories/detect). */
    public function prediction(string $title): ?array
    {
        $all = $this->detect($title, true);
        $first = $all[0] ?? null;
        if (! $first || $first['cat_id'] === []) {
            return null;
        }
        $ids = $first['cat_id'];

        return [
            'name' => $first['cat_title'],
            'category_id' => (int) end($ids),
            'level1' => $ids[0] ?? null,
            'level2' => $ids[1] ?? null,
            'level3' => $ids[2] ?? null,
            'candidates' => $all,
        ];
    }

    /** @return list<array{id: int, title: string}> Flattened attribute definitions of a category (cached 6h). */
    public function attributes(int $categoryId): array
    {
        if ($categoryId < 1) {
            return [];
        }

        return Cache::remember('marketplace:basalam:attrs:'.$categoryId, 21600, function () use ($categoryId) {
            $body = $this->client->get(sprintf(BasalamEndpoints::CATEGORY_ATTRIBUTES, $categoryId));
            $out = [];
            foreach ((array) ($body['data'] ?? []) as $group) {
                foreach ((array) (is_array($group) ? ($group['attributes'] ?? []) : []) as $attr) {
                    if (is_array($attr) && isset($attr['id'])) {
                        $out[] = ['id' => (int) $attr['id'], 'title' => (string) ($attr['title'] ?? '')] + array_filter([
                            'required' => $attr['required'] ?? null,
                            'type' => $attr['type'] ?? null,
                            'unit' => $attr['unit'] ?? null,
                        ], fn ($v) => $v !== null);
                    }
                }
            }

            return $out;
        });
    }

    /** Raw attribute groups (REST categories/attributes). */
    public function attributeGroups(int $categoryId): array
    {
        $body = $this->client->get(sprintf(BasalamEndpoints::CATEGORY_ATTRIBUTES, $categoryId));

        return (array) ($body['data'] ?? $body);
    }

    // ── Preparation caps ────────────────────────────────────────────────

    /** @return array<int, ?int> category id => max preparation days (public core endpoint, cached one day). */
    public function preparationMap(): array
    {
        $key = 'marketplace:basalam:preparation';
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }
        try {
            $res = Http::timeout(20)->acceptJson()->withHeaders(['User-Agent' => 'Webino-Basalam', 'Referer' => BasalamAuth::siteUrl($this->tid())])
                ->get(BasalamEndpoints::CATEGORIES_PREPARATION);
            $data = $res->json('data');
            if (! $res->ok() || ! is_array($data)) {
                throw new MarketplaceException('invalid response', $res->status());
            }
        } catch (Throwable $e) {
            MarketplaceLogger::error($this->tid(), 'basalam', 'categories', 'خطا در دریافت زمان آماده‌سازی دسته‌بندی‌های باسلام: '.$e->getMessage());
            Cache::put($key, [], 3600);

            return [];
        }
        $map = [];
        $walk = function (array $nodes) use (&$walk, &$map) {
            foreach ($nodes as $node) {
                if (! is_array($node) || ! isset($node['id'])) {
                    continue;
                }
                $max = $node['max_preparation_days'] ?? null;
                $map[(int) $node['id']] = is_numeric($max) ? (int) $max : null;
                if (is_array($node['children'] ?? null)) {
                    $walk($node['children']);
                }
            }
        };
        $walk($data);
        Cache::put($key, $map, 86400);

        return $map;
    }

    public function maxPreparationDays(?int $categoryId): ?int
    {
        if (! $categoryId) {
            return null;
        }

        return $this->preparationMap()[$categoryId] ?? null;
    }

    // ── Product → Basalam category ──────────────────────────────────────

    /**
     * Basalam category chain for a product: first mapped local category, otherwise title detection
     * (prefix/suffix applied like the WordPress engine).
     *
     * @param  array<string, mixed>  $engine
     * @return list<int>
     */
    public function categoryIdsFor(Product $product, array $engine): array
    {
        $cacheKey = (string) $product->id;
        if (isset($this->resolved[$cacheKey])) {
            return $this->resolved[$cacheKey];
        }
        $override = array_values(array_filter(array_map('intval', (array) data_get($product->meta, 'marketplace.basalam.category_ids', []))));
        if ($override !== []) {
            return $this->resolved[$cacheKey] = $override;
        }
        $mapped = $this->mappedIds($product);
        if ($mapped !== []) {
            return $this->resolved[$cacheKey] = $mapped;
        }
        $title = (string) $product->name;
        if (($engine['product_prefix_title'] ?? '') !== '') {
            $title = $engine['product_prefix_title'].' '.$title;
        }
        if (($engine['product_suffix_title'] ?? '') !== '') {
            $title .= ' '.$engine['product_suffix_title'];
        }
        try {
            $ids = $this->detect($title);
        } catch (MarketplaceException $e) {
            throw new MarketplaceException('[category_detect] '.$e->getMessage(), $e->status, $e->response, $e->retryAfter, $e->path);
        }

        return $this->resolved[$cacheKey] = array_values(array_unique(array_filter(array_map('intval', $ids))));
    }

    /** @return list<int> */
    protected function mappedIds(Product $product): array
    {
        $local = array_values(array_unique(array_filter(array_merge(
            [$product->category_id],
            $product->relationLoaded('categories') ? $product->categories->pluck('id')->all() : $product->categories()->pluck('categories.id')->all(),
        ))));
        foreach ($local as $categoryId) {
            $row = DB::table(self::MAPPINGS)->where('tenant_id', $this->tid())->where('category_id', (int) $categoryId)->first();
            if ($row) {
                $ids = array_values(array_filter([(int) $row->level1, (int) $row->level2, (int) $row->level3]));
                if ($ids !== []) {
                    return $ids;
                }
            }
        }

        return [];
    }

    // ── Category mappings ───────────────────────────────────────────────

    /** @return list<array<string, mixed>> */
    public function mappings(): array
    {
        return DB::table(self::MAPPINGS)->where('tenant_id', $this->tid())->orderByDesc('id')->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'category_id' => (int) $r->category_id,
                'category_name' => (string) $r->category_name,
                'basalam_category_level1' => $r->level1 ? (int) $r->level1 : null,
                'basalam_category_level2' => $r->level2 ? (int) $r->level2 : null,
                'basalam_category_level3' => $r->level3 ? (int) $r->level3 : null,
                'basalam_category_ids' => array_values(array_filter([(int) $r->level1, (int) $r->level2, (int) $r->level3])),
                'basalam_category_name' => (string) $r->basalam_category_name,
                'woo_category_id' => (int) $r->category_id,
                'woo_category_name' => (string) $r->category_name,
            ])->all();
    }

    /** @param  array<string, mixed>  $data */
    public function saveMapping(array $data): array
    {
        $categoryId = (int) ($data['category_id'] ?? $data['woo_category_id'] ?? 0);
        $category = Category::query()->where('tenant_id', $this->tid())->find($categoryId);
        if (! $category) {
            throw new MarketplaceException(__('marketplace.basalam_mapping_category_invalid'), 422);
        }
        $levels = [];
        foreach ([1, 2, 3] as $i) {
            $v = (int) ($data['basalam_category_level'.$i] ?? $data['level'.$i] ?? 0);
            $levels[$i] = $v > 0 ? $v : null;
        }
        if (! $levels[1] && ! $levels[2] && ! $levels[3]) {
            throw new MarketplaceException(__('marketplace.basalam_mapping_levels_required'), 422);
        }
        DB::table(self::MAPPINGS)->updateOrInsert(
            ['tenant_id' => $this->tid(), 'category_id' => $category->id],
            [
                'category_name' => mb_substr((string) (($data['category_name'] ?? $data['woo_category_name'] ?? '') ?: $category->name), 0, 191),
                'level1' => $levels[1],
                'level2' => $levels[2],
                'level3' => $levels[3],
                'basalam_category_name' => mb_substr((string) ($data['basalam_category_name'] ?? ''), 0, 191),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
        $this->resolved = [];

        return $this->mappings();
    }

    public function deleteMapping(int $id): bool
    {
        return DB::table(self::MAPPINGS)->where('tenant_id', $this->tid())->where(fn ($q) => $q->where('id', $id)->orWhere('category_id', $id))->delete() > 0;
    }

    // ── Option maps (local attribute name → Basalam attribute title) ──

    /** @return list<array{id: int, local_name: string, basalam_name: string, woo_name: string, webino_basalam_name: string}> */
    public function optionMaps(): array
    {
        return DB::table(self::OPTION_MAPS)->where('tenant_id', $this->tid())->orderBy('local_name')->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'local_name' => (string) $r->local_name,
                'basalam_name' => (string) $r->basalam_name,
                'woo_name' => (string) $r->local_name,
                'webino_basalam_name' => (string) $r->basalam_name,
            ])->all();
    }

    /** @param  array<string, mixed>  $data */
    public function saveOptionMap(array $data): array
    {
        $local = trim((string) ($data['local_name'] ?? $data['woo_name'] ?? $data['woo_attr_name'] ?? ''));
        $remote = trim((string) ($data['basalam_name'] ?? $data['webino_basalam_name'] ?? $data['basalam_attr_name'] ?? ''));
        if ($local === '' || $remote === '') {
            throw new MarketplaceException(__('marketplace.basalam_option_map_required'), 422);
        }
        $id = (int) ($data['id'] ?? 0);
        if ($id > 0 && DB::table(self::OPTION_MAPS)->where('tenant_id', $this->tid())->where('id', $id)->exists()) {
            DB::table(self::OPTION_MAPS)->where('id', $id)->update(['local_name' => mb_substr($local, 0, 191), 'basalam_name' => mb_substr($remote, 0, 191), 'updated_at' => now()]);
        } else {
            DB::table(self::OPTION_MAPS)->updateOrInsert(
                ['tenant_id' => $this->tid(), 'local_name' => mb_substr($local, 0, 191)],
                ['basalam_name' => mb_substr($remote, 0, 191), 'updated_at' => now(), 'created_at' => now()]
            );
        }

        return $this->optionMaps();
    }

    public function deleteOptionMap(int $id): bool
    {
        return DB::table(self::OPTION_MAPS)->where('tenant_id', $this->tid())->where('id', $id)->delete() > 0;
    }

    /** @return array<string, string> local attribute name => Basalam attribute title */
    public function optionMapIndex(): array
    {
        return DB::table(self::OPTION_MAPS)->where('tenant_id', $this->tid())->pluck('basalam_name', 'local_name')
            ->mapWithKeys(fn ($v, $k) => [trim((string) $k) => trim((string) $v)])->all();
    }
}
