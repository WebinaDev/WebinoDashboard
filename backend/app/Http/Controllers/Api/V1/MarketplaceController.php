<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceJob;
use App\Models\MarketplaceLog;
use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplacePlatforms;
use App\Services\Marketplace\MarketplacePricing;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

class MarketplaceController extends Controller
{
    public function __construct(
        protected MarketplaceSettingsService $settings,
        protected MarketplaceSync $sync,
    ) {}

    protected function tid(Request $request): int
    {
        return (int) $request->user()->tenant_id;
    }

    protected function paginated(\Illuminate\Contracts\Pagination\LengthAwarePaginator $p): JsonResponse
    {
        return response()->json([
            'data' => $p->items(),
            'meta' => [
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
        ]);
    }

    protected function assertPlatform(string $platform): void
    {
        abort_unless(MarketplacePlatforms::exists($platform), 404);
    }

    public function hub(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $mapCounts = MarketplaceProductMap::query()->where('tenant_id', $tid)
            ->selectRaw('platform, count(*) as c, sum(case when last_error is not null then 1 else 0 end) as e, max(last_sync_at) as s')
            ->groupBy('platform')->get()->keyBy('platform');
        $orderCounts = MarketplaceOrderMap::query()->where('tenant_id', $tid)
            ->selectRaw('platform, count(*) as c')->groupBy('platform')->pluck('c', 'platform');
        $failedJobs = MarketplaceJob::query()->where('tenant_id', $tid)->where('status', 'failed')
            ->selectRaw('platform, count(*) as c')->groupBy('platform')->pluck('c', 'platform');

        $rows = [];
        foreach (MarketplacePlatforms::CATALOG as $slug => $meta) {
            $raw = $this->settings->raw($tid, $slug);
            $m = $mapCounts->get($slug);
            $rows[] = [
                'platform' => $slug,
                'label' => $meta['label'],
                'label_en' => $meta['label_en'],
                'kind' => $meta['kind'],
                'pricing_tab' => $meta['pricing_tab'],
                'supports_orders' => $meta['orders'],
                'supports_create' => $meta['create'],
                'enabled' => $raw['enabled'],
                'auto_sync' => $raw['auto_sync'],
                'configured' => $this->isConfigured($tid, $slug, $raw['credentials']),
                'maps_count' => (int) ($m->c ?? 0),
                'map_errors' => (int) ($m->e ?? 0),
                'last_sync_at' => $m->s ?? null,
                'orders_count' => (int) ($orderCounts[$slug] ?? 0),
                'failed_jobs' => (int) ($failedJobs[$slug] ?? 0),
                'has_webhook_secret' => $slug === 'digikala'
                    ? filled($raw['credentials']['webhook_secret'] ?? null)
                    : null,
            ];
        }

        return response()->json(['data' => ['platforms' => $rows]]);
    }

    /** @param  array<string, mixed>  $c */
    protected function isConfigured(int $tid, string $slug, array $c): bool
    {
        return match ($slug) {
            'digikala' => filled($c['client_code']) && (filled($this->settings->state($tid, 'digikala')['access_token'] ?? null) || filled($c['encrypted_code'])),
            'basalam' => filled($c['access_token']) && filled($c['vendor_id']),
            'snappshop' => (filled($c['token']) || filled($c['token_api'])) && (filled($c['vendor_id']) || filled($c['shop_code'])),
            'tapsishop' => filled($c['token']),
            'technolife' => filled($c['api_key']) && filled($c['base_url']),
            default => true,
        };
    }

    public function settings(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $tid = $this->tid($request);
        $data = $this->settings->publicView($tid, $platform);
        $data['meta'] = MarketplacePlatforms::CATALOG[$platform];
        if (MarketplacePlatforms::isFeed($platform)) {
            $data['feed_urls'] = $this->feedUrlList($request, $platform);
        }

        return response()->json(['data' => $data]);
    }

    public function saveSettings(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'auto_sync' => ['sometimes', 'boolean'],
            'credentials' => ['sometimes', 'array'],
            'clear_secrets' => ['sometimes', 'array'],
        ]);

        return response()->json(['data' => $this->settings->save($this->tid($request), $platform, $data)]);
    }

    public function testConnection(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $tid = $this->tid($request);
        try {
            $result = MarketplaceAdapterRegistry::make($platform, $tid)->testConnection();
        } catch (Throwable $e) {
            $result = ['ok' => false, 'message' => $e->getMessage()];
        }
        $this->settings->putState($tid, $platform, ['last_test' => ['ok' => $result['ok'], 'message' => $result['message'], 'at' => now()->toIso8601String()]]);

        return response()->json(['data' => $result, 'message' => $result['message']], $result['ok'] ? 200 : 422);
    }

    public function syncNow(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        abort_if(MarketplacePlatforms::isFeed($platform), 422, __('marketplace.feed_no_push'));
        $job = $this->sync->enqueue($this->tid($request), $platform, MarketplaceSync::SYNC_ALL, [], 2, 0, MarketplaceSync::SYNC_ALL);

        return response()->json(['data' => $job->fresh()]);
    }

    public function pullOrders(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        abort_unless(MarketplacePlatforms::CATALOG[$platform]['orders'], 422, __('marketplace.orders_unsupported'));
        $job = $this->sync->enqueue($this->tid($request), $platform, MarketplaceSync::PULL_ORDERS, [], 5, 0, MarketplaceSync::PULL_ORDERS);

        return response()->json(['data' => $job->fresh()]);
    }

    public function platformMaps(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $q = trim((string) $request->query('q', ''));
        $status = (string) $request->query('status', '');
        $rows = MarketplaceProductMap::query()
            ->where('tenant_id', $this->tid($request))
            ->where('platform', $platform)
            ->with(['product:id,name,sku,image_url,price_minor,stock', 'variant:id,product_id,name,sku,price_minor,stock'])
            ->when($q !== '', fn ($query) => $query->where(function ($w) use ($q) {
                $w->where('remote_product_id', 'like', "%{$q}%")
                    ->orWhere('remote_variant_id', 'like', "%{$q}%")
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', "%{$q}%")->orWhere('sku', 'like', "%{$q}%"));
            }))
            ->when($status === 'error', fn ($query) => $query->whereNotNull('last_error'))
            ->when($status === 'synced', fn ($query) => $query->whereNull('last_error')->whereNotNull('last_sync_at'))
            ->when($status === 'disabled', fn ($query) => $query->where('sync_enabled', false))
            ->orderByDesc('id')
            ->paginate(min(100, max(10, (int) $request->query('per_page', 25))));

        return $this->paginated($rows);
    }

    public function deleteMap(Request $request, MarketplaceProductMap $map): JsonResponse
    {
        abort_if($map->tenant_id !== $this->tid($request), 403);
        $map->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function pushMap(Request $request, MarketplaceProductMap $map): JsonResponse
    {
        abort_if($map->tenant_id !== $this->tid($request), 403);
        try {
            $result = $this->sync->pushMap($map->id);
        } catch (Throwable $e) {
            return response()->json(['message' => $e->getMessage(), 'data' => $map->fresh()], 422);
        }

        return response()->json(['data' => array_merge(['map' => $map->fresh()], $result)]);
    }

    public function jobs(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $rows = MarketplaceJob::query()
            ->where('tenant_id', $this->tid($request))
            ->where('platform', $platform)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('id')
            ->paginate(min(100, max(10, (int) $request->query('per_page', 25))));

        return $this->paginated($rows);
    }

    public function retryJob(Request $request, MarketplaceJob $job): JsonResponse
    {
        abort_if($job->tenant_id !== $this->tid($request), 403);

        return response()->json(['data' => $this->sync->retry($job)]);
    }

    public function cancelJob(Request $request, MarketplaceJob $job): JsonResponse
    {
        abort_if($job->tenant_id !== $this->tid($request), 403);
        if (in_array($job->status, ['pending', 'retrying'], true)) {
            $job->update(['status' => 'cancelled', 'finished_at' => now()]);
        }

        return response()->json(['data' => $job->fresh()]);
    }

    public function logs(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $rows = MarketplaceLog::query()
            ->where('tenant_id', $this->tid($request))
            ->where('platform', $platform)
            ->when($request->query('level'), fn ($q, $l) => $q->where('level', $l))
            ->when($request->query('channel'), fn ($q, $c) => $q->where('channel', $c))
            ->orderByDesc('id')
            ->paginate(min(200, max(10, (int) $request->query('per_page', 50))));

        return $this->paginated($rows);
    }

    public function clearLogs(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        MarketplaceLog::query()->where('tenant_id', $this->tid($request))->where('platform', $platform)->delete();

        return response()->json(['data' => ['cleared' => true]]);
    }

    public function orders(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $rows = MarketplaceOrderMap::query()
            ->where('tenant_id', $this->tid($request))
            ->where('platform', $platform)
            ->with('order:id,number,status,total_minor,currency,customer_name,created_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(10, (int) $request->query('per_page', 25))));
        $rows->getCollection()->transform(function (MarketplaceOrderMap $m) {
            $m->makeHidden('raw');

            return $m;
        });

        return $this->paginated($rows);
    }

    public function search(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        try {
            $items = MarketplaceAdapterRegistry::make($platform, $this->tid($request))
                ->searchProducts((string) $request->query('q', ''), max(1, (int) $request->query('page', 1)));
        } catch (MarketplaceException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $items]);
    }

    public function feedUrls(Request $request, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);

        return response()->json(['data' => $this->feedUrlList($request, $platform)]);
    }

    /** @return list<array{key: string, url: string, method: string}> */
    protected function feedUrlList(Request $request, string $platform): array
    {
        $tenant = Tenant::query()->find($this->tid($request));
        $domain = $tenant?->domain ? 'https://'.preg_replace('#^https?://#', '', rtrim($tenant->domain, '/')) : rtrim(config('app.url'), '/');
        $native = $domain.'/api/v1/public/marketplace/'.$platform;
        $wp = $domain.'/wp-json';

        return match ($platform) {
            'emalls' => [
                ['key' => 'products', 'url' => $native.'/products', 'method' => 'POST'],
                ['key' => 'products_wp', 'url' => $wp.'/emalls_ext/v1/products', 'method' => 'POST'],
            ],
            'zarehbin' => [
                ['key' => 'products', 'url' => $native.'/products', 'method' => 'POST'],
                ['key' => 'products_wp', 'url' => $wp.'/zarehbin/v1/products', 'method' => 'POST'],
            ],
            'snapppay-search' => [
                ['key' => 'feed', 'url' => $native.'/feed', 'method' => 'POST'],
                ['key' => 'feed_wp', 'url' => $wp.'/v1/product/feed', 'method' => 'POST'],
            ],
            'torob' => [
                ['key' => 'products_v3', 'url' => $wp.'/torob_api/v3/products', 'method' => 'POST'],
                ['key' => 'products_legacy', 'url' => $wp.'/wcpe/v1/products', 'method' => 'POST'],
                ['key' => 'set_token', 'url' => $wp.'/torob-api/v1/set-token', 'method' => 'POST'],
                ['key' => 'order_status', 'url' => $wp.'/torob-api/v1/order-status', 'method' => 'GET'],
                ['key' => 'orders', 'url' => $wp.'/torob/v1/orders', 'method' => 'GET'],
                ['key' => 'actions', 'url' => $wp.'/torob/v1/actions', 'method' => 'GET'],
                ['key' => 'native_v3', 'url' => $native.'/v3/products', 'method' => 'POST'],
            ],
            default => [],
        };
    }

    // ── Pricing ─────────────────────────────────────────────────────────

    public function pricing(Request $request): JsonResponse
    {
        return response()->json(['data' => MarketplacePricing::forTenant($this->tid($request))->allPlatformSettings()]);
    }

    public function savePricing(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platforms' => ['required', 'array'],
            'platforms.*.enabled' => ['sometimes', 'boolean'],
            'platforms.*.profit_percent' => ['sometimes', 'numeric', 'min:-100', 'max:1000'],
            'platforms.*.extra_percent' => ['sometimes', 'numeric', 'min:-100', 'max:1000'],
            'platforms.*.round_enabled' => ['sometimes', 'boolean'],
            'platforms.*.round_to' => ['sometimes', 'integer', 'min:1'],
            'platforms.*.price_unit' => ['sometimes', 'in:rial,toman'],
            'platforms.*.price_mode' => ['sometimes', 'in:retail,markup'],
            'platforms.*.use_sale_price' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['data' => MarketplacePricing::savePlatformSettings($this->tid($request), $data['platforms'])]);
    }

    public function pricingPreview(Request $request, Product $product): JsonResponse
    {
        abort_if($product->tenant_id !== $this->tid($request), 403);
        $variant = $request->input('variant_id')
            ? ProductVariant::query()->where('product_id', $product->id)->find((int) $request->input('variant_id'))
            : null;

        return response()->json(['data' => MarketplacePricing::forTenant($product->tenant_id)->preview($product, $variant)]);
    }

    // ── Product editor ──────────────────────────────────────────────────

    public function maps(Request $request, Product $product): JsonResponse
    {
        abort_if($this->tid($request) !== $product->tenant_id, 403);
        $existing = MarketplaceProductMap::query()->where('product_id', $product->id)->get();
        $variants = $product->variants()->get(['id', 'name', 'sku', 'attribute_values']);

        $rows = [];
        foreach (MarketplacePlatforms::CATALOG as $platform => $meta) {
            $productLevel = $existing->first(fn ($m) => $m->platform === $platform && $m->product_variant_id === null);
            $rows[] = array_merge($this->mapRow($platform, null, $productLevel), [
                'kind' => $meta['kind'],
                'can_create' => $meta['create'],
                'enabled' => $this->settings->isEnabled($product->tenant_id, $platform),
                'variants' => $variants->map(fn ($v) => array_merge(
                    $this->mapRow($platform, $v->id, $existing->first(fn ($m) => $m->platform === $platform && $m->product_variant_id === $v->id)),
                    ['variant_name' => $v->name, 'variant_sku' => $v->sku]
                ))->values()->all(),
            ]);
        }

        return response()->json(['data' => $rows]);
    }

    /** @return array<string, mixed> */
    protected function mapRow(string $platform, ?int $variantId, ?MarketplaceProductMap $map): array
    {
        return [
            'id' => $map?->id,
            'platform' => $platform,
            'product_variant_id' => $variantId,
            'remote_product_id' => $map?->remote_product_id,
            'remote_variant_id' => $map?->remote_variant_id,
            'remote_url' => $map?->remote_url,
            'sync_enabled' => (bool) ($map?->sync_enabled),
            'last_sync_at' => $map?->last_sync_at,
            'last_error' => $map?->last_error,
            'remote_price' => $map?->remote_price,
            'remote_stock' => $map?->remote_stock,
            'meta' => $map?->meta,
        ];
    }

    public function saveMaps(Request $request, Product $product): JsonResponse
    {
        abort_if($this->tid($request) !== $product->tenant_id, 403);
        $data = $request->validate([
            'maps' => ['required', 'array'],
            'maps.*.platform' => ['required', 'string', Rule::in(MarketplacePlatforms::slugs())],
            'maps.*.product_variant_id' => ['nullable', 'integer'],
            'maps.*.remote_product_id' => ['nullable', 'string', 'max:255'],
            'maps.*.remote_variant_id' => ['nullable', 'string', 'max:255'],
            'maps.*.remote_url' => ['nullable', 'string', 'max:2048'],
            'maps.*.sync_enabled' => ['nullable', 'boolean'],
            'maps.*.meta' => ['nullable', 'array'],
        ]);
        $variantIds = $product->variants()->pluck('id')->all();

        foreach ($data['maps'] as $row) {
            $variantId = isset($row['product_variant_id']) ? (int) $row['product_variant_id'] : null;
            if ($variantId !== null && ! in_array($variantId, $variantIds, true)) {
                continue;
            }
            $existing = MarketplaceProductMap::query()
                ->where('product_id', $product->id)
                ->where('platform', $row['platform'])
                ->where('variant_key', (int) ($variantId ?? 0))
                ->first();
            $empty = empty($row['remote_product_id']) && empty($row['remote_variant_id']) && empty($row['remote_url']);
            if ($empty && ! MarketplacePlatforms::isFeed($row['platform'])) {
                $existing?->delete();

                continue;
            }
            $attrs = [
                'tenant_id' => $product->tenant_id,
                'product_id' => $product->id,
                'product_variant_id' => $variantId,
                'platform' => $row['platform'],
                'remote_product_id' => $row['remote_product_id'] ?? null,
                'remote_variant_id' => $row['remote_variant_id'] ?? null,
                'remote_url' => $row['remote_url'] ?? null,
                'sync_enabled' => (bool) ($row['sync_enabled'] ?? false),
            ];
            if (array_key_exists('meta', $row)) {
                $attrs['meta'] = array_merge($existing?->meta ?? [], $row['meta'] ?? []);
            }
            $existing ? $existing->update($attrs) : MarketplaceProductMap::query()->create($attrs);
        }

        return $this->maps($request, $product);
    }

    public function savePlatformPrices(Request $request, Product $product): JsonResponse
    {
        abort_if($this->tid($request) !== $product->tenant_id, 403);
        $data = $request->validate([
            'product_variant_id' => ['nullable', 'integer'],
            'prices' => ['present', 'array'],
            'prices.*.lock' => ['boolean'],
            'prices.*.price' => ['nullable', 'numeric', 'min:0'],
        ]);
        $target = isset($data['product_variant_id'])
            ? ProductVariant::query()->where('product_id', $product->id)->findOrFail((int) $data['product_variant_id'])
            : $product;
        $current = (array) ($target->platform_prices ?? []);
        foreach ($data['prices'] as $platform => $row) {
            if (! MarketplacePlatforms::exists((string) $platform)) {
                continue;
            }
            $price = isset($row['price']) ? (float) $row['price'] : 0;
            if (empty($row['lock']) && $price <= 0) {
                unset($current[$platform]);
            } else {
                $current[$platform] = ['lock' => (bool) ($row['lock'] ?? false), 'price' => $price];
            }
        }
        $target->platform_prices = $current ?: null;
        $target->save();

        return $this->pricingPreview($request->merge(['variant_id' => $data['product_variant_id'] ?? null]), $product);
    }

    public function syncProduct(Request $request, Product $product): JsonResponse
    {
        abort_if($this->tid($request) !== $product->tenant_id, 403);
        $maps = MarketplaceProductMap::query()
            ->where('product_id', $product->id)
            ->where('sync_enabled', true)
            ->get()
            ->reject(fn ($m) => MarketplacePlatforms::isFeed($m->platform));

        $results = [];
        foreach ($maps as $map) {
            try {
                $r = $this->sync->pushMap($map->id);
                $results[] = ['platform' => $map->platform, 'product_variant_id' => $map->product_variant_id, 'ok' => true, 'price' => $r['price'] ?? null, 'stock' => $r['stock'] ?? null];
            } catch (Throwable $e) {
                $results[] = ['platform' => $map->platform, 'product_variant_id' => $map->product_variant_id, 'ok' => false, 'error' => $e->getMessage()];
            }
        }

        return response()->json(['data' => ['synced' => count(array_filter($results, fn ($r) => $r['ok'])), 'results' => $results]]);
    }

    public function createRemote(Request $request, Product $product): JsonResponse
    {
        abort_if($this->tid($request) !== $product->tenant_id, 403);
        $data = $request->validate([
            'platform' => ['required', 'string', Rule::in(MarketplacePlatforms::slugs())],
            'product_variant_id' => ['nullable', 'integer'],
        ]);
        $variant = isset($data['product_variant_id'])
            ? ProductVariant::query()->where('product_id', $product->id)->findOrFail((int) $data['product_variant_id'])
            : null;
        $adapter = MarketplaceAdapterRegistry::make($data['platform'], $product->tenant_id);
        if (! $adapter->supportsCreate()) {
            return response()->json(['message' => __('marketplace.create_unsupported')], 422);
        }
        try {
            $result = $adapter->createProduct($product, $variant);
        } catch (MarketplaceException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if (! empty($result['stored'])) {
            return $this->maps($request, $product);
        }
        MarketplaceProductMap::query()->updateOrCreate(
            ['product_id' => $product->id, 'variant_key' => (int) ($variant?->id ?? 0), 'platform' => $data['platform']],
            [
                'tenant_id' => $product->tenant_id,
                'product_variant_id' => $variant?->id,
                'remote_product_id' => $result['remote_product_id'] ?? null,
                'remote_variant_id' => $result['remote_variant_id'] ?? null,
                'remote_url' => $result['remote_url'] ?? null,
                'sync_enabled' => true,
            ]
        );

        return $this->maps($request, $product);
    }
}
