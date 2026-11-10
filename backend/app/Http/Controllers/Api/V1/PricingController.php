<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\RecalculatePricesJob;
use App\Models\Brand;
use App\Models\BulkPriceJob;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\MarketplacePlatforms;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\BulkPriceChangeService;
use App\Services\Pricing\ExchangeRateService;
use App\Services\Pricing\PricingCalculator;
use App\Services\Pricing\PricingSettings;
use App\Services\Pricing\ReferencePriceService;
use Illuminate\Http\Request;
use RuntimeException;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PricingController extends Controller
{
    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => PricingSettings::get($request->user()->tenant_id)]);
    }

    public function updateSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['payload' => ['required', 'array']]);

        return response()->json(['data' => PricingSettings::import($request->user()->tenant_id, $data['payload'])]);
    }

    public function saveSection(Request $request, string $section): \Illuminate\Http\JsonResponse
    {
        $body = $request->all();
        $data = is_array($body['data'] ?? null) ? $body['data'] : $body;
        $settings = PricingSettings::saveSection($request->user()->tenant_id, $section, $data);

        return response()->json(['data' => ['success' => true, 'section' => PricingSettings::storageKey($section), 'settings' => $settings]]);
    }

    public function meta(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $gateways = collect(app(PaymentGatewaySettingsService::class)->hubItems($tid))
            ->map(fn (array $g) => [
                'id' => $g['id'],
                'title_key' => $g['title_key'],
                'label_fa' => $g['label_fa'] ?? $g['id'],
                'label_en' => $g['label_en'] ?? $g['id'],
                'category' => $g['category'] ?? 'other',
                'enabled' => $g['enabled'],
            ])
            ->values();
        $platforms = collect(MarketplacePlatforms::CATALOG)
            ->filter(fn (array $p) => ($p['status'] ?? MarketplacePlatforms::LIVE) === MarketplacePlatforms::LIVE)
            ->map(fn (array $p, string $slug) => [
                'slug' => $slug,
                'label' => $p['label'],
                'label_en' => $p['label_en'],
                'tab' => $p['pricing_tab'],
                'feed' => MarketplacePlatforms::isFeed($slug),
            ])->values();

        return response()->json(['data' => [
            'gateways' => $gateways,
            'platforms' => $platforms,
            'categories' => Category::query()->where('tenant_id', $tid)->orderBy('name')->get(['id', 'name', 'slug']),
            'brands' => Brand::query()->where('tenant_id', $tid)->orderBy('name')->get(['id', 'name', 'slug']),
            'currency' => strtoupper((string) ($request->user()->tenant?->default_currency ?: 'IRT')),
        ]]);
    }

    public function stats(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $calc = PricingCalculator::forTenant($tid);
        $base = Product::query()->where('tenant_id', $tid)->where('status', '!=', 'trash');
        $general = $calc->section('general');

        return response()->json(['data' => [
            'total_products' => (clone $base)->count(),
            'products_with_price' => (clone $base)->where('purchase_price_minor', '>', 0)->count(),
            'products_locked' => (clone $base)->where('lock_price', true)->count(),
            'enabled' => PricingCalculator::bool($general['enabled'] ?? true),
            'exchange_rate' => (float) ($general['exchange_rate'] ?? 0),
            'exchange_rate_enabled' => PricingCalculator::bool($general['exchange_rate_enabled'] ?? false),
            'last_api_update' => $general['last_api_update'] ?? null,
            'purchase_types' => $calc->enabledPurchaseTypes(),
            'currency' => strtoupper((string) ($request->user()->tenant?->default_currency ?: 'IRT')),
            'recalculate' => RecalculatePricesJob::state($tid),
        ]]);
    }

    public function exchangeTest(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'api_key' => ['required', 'string', 'max:255'],
            'api_symbol' => ['nullable', 'string', 'max:16'],
        ]);
        $result = ExchangeRateService::fetchRate($data['api_key'], strtoupper($data['api_symbol'] ?? 'USD'));
        if (! $result['success']) {
            return response()->json(['message' => $result['message'] ?? __('Exchange test failed.')], 400);
        }

        return response()->json(['data' => $result]);
    }

    public function exchangeFetch(Request $request): \Illuminate\Http\JsonResponse
    {
        $result = ExchangeRateService::update($request->user()->tenant_id);
        if (! $result['success']) {
            return response()->json(['message' => $result['message'] ?? __('Could not update exchange rate.')], 400);
        }

        return response()->json(['data' => $result]);
    }

    public function referenceFetch(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'url' => ['nullable', 'url', 'max:2048'],
            'variant_id' => ['nullable', 'integer'],
        ]);
        $variant = ! empty($data['variant_id'])
            ? ProductVariant::query()->where('product_id', $product->id)->findOrFail($data['variant_id'])
            : null;
        try {
            $result = (new ReferencePriceService($product->tenant_id))->sync($product, $variant, $data['url'] ?? null);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $fresh = ($variant ?? $product)->fresh();

        return response()->json(['data' => [
            'ok' => true,
            'result' => $result,
            'purchase_price_minor' => $fresh->purchase_price_minor,
            'price_minor' => $fresh->price_minor,
            'url' => $result['url'],
            'source' => $result['source'],
        ]]);
    }

    public function recalculateStart(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $state = RecalculatePricesJob::state($tid);
        if (in_array($state['status'] ?? 'idle', ['queued', 'running'], true)
            && now()->diffInMinutes($state['started_at'] ?? now()) < 30) {
            return response()->json(['message' => __('A recalculation is already running.'), 'data' => $state], 409);
        }

        return response()->json(['data' => RecalculatePricesJob::start($tid, $request->boolean('dry_run'))]);
    }

    public function recalculateState(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => RecalculatePricesJob::state($request->user()->tenant_id)]);
    }

    public function exportSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $settings = PricingSettings::get($request->user()->tenant_id);
        $settings['general']['api_key'] = '';

        return response()->json(['data' => [
            'json' => json_encode(['wfcp_settings' => $settings, 'exported_at' => now()->toIso8601String()], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        ]]);
    }

    public function importSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['json' => ['required', 'string', 'max:500000']]);
        $decoded = json_decode($data['json'], true);
        if (! is_array($decoded)) {
            return response()->json(['message' => __('Invalid JSON.')], 422);
        }
        $settings = is_array($decoded['wfcp_settings'] ?? null) ? $decoded['wfcp_settings'] : $decoded;
        if (isset($settings['general']) && is_array($settings['general']) && ($settings['general']['api_key'] ?? '') === '') {
            unset($settings['general']['api_key']);
        }

        return response()->json(['data' => PricingSettings::import($request->user()->tenant_id, $settings)]);
    }

    public function patchBrand(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate(['brand_id' => ['nullable', 'integer']]);
        $brandId = (int) ($data['brand_id'] ?? 0);
        if ($brandId > 0) {
            abort_unless(Brand::query()->where('tenant_id', $product->tenant_id)->whereKey($brandId)->exists(), 422);
            $product->brands()->sync([$brandId]);
        } else {
            $product->brands()->sync([]);
        }

        return response()->json(['data' => $product->fresh('brands')]);
    }

    public function calculate(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'purchase_price_minor' => ['required', 'numeric', 'min:0'],
            'type' => ['nullable', 'string'],
            'months' => ['nullable', 'integer', 'min:1'],
            'product_id' => ['nullable', 'integer'],
        ]);
        $tid = $request->user()->tenant_id;
        $calc = PricingCalculator::forTenant($tid);
        $purchase = (float) $data['purchase_price_minor'];
        $product = ! empty($data['product_id'])
            ? Product::query()->where('tenant_id', $tid)->find($data['product_id'])
            : null;
        $out = $calc->derived($purchase, $product);
        if (! empty($data['type'])) {
            $out['value'] = $calc->calculate($purchase, $data['type'], ['months' => (int) ($data['months'] ?? $calc->defaultInstallmentMonths())], $product);
        }
        $channels = [];
        foreach (MarketplacePlatforms::slugs() as $slug) {
            $channels[$slug] = $calc->channel($purchase, $slug, $product);
        }
        $out['channels'] = $channels;

        return response()->json(['data' => $out]);
    }

    public function quickAdd(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'purchase_price_minor' => ['required', 'integer', 'min:1'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'category_id' => ['nullable', 'integer'],
            'brand_id' => ['nullable', 'integer'],
        ]);

        $calc = PricingCalculator::forTenant($tid);
        $retail = (int) round($calc->calculate((float) $data['purchase_price_minor'], 'retail'));
        $slug = Str::slug($data['name']) ?: 'product';
        $base = $slug;
        $i = 1;
        while (Product::query()->where('tenant_id', $tid)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        $categoryId = isset($data['category_id']) ? (int) $data['category_id'] : 0;
        $brandId = isset($data['brand_id']) ? (int) $data['brand_id'] : 0;
        if ($categoryId > 0) {
            abort_unless(Category::query()->where('tenant_id', $tid)->whereKey($categoryId)->exists(), 422);
        }
        if ($brandId > 0) {
            abort_unless(Brand::query()->where('tenant_id', $tid)->whereKey($brandId)->exists(), 422);
        }

        $product = Product::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
            'image_url' => $data['image_url'] ?? null,
            'category_id' => $categoryId > 0 ? $categoryId : null,
            'purchase_price_minor' => $data['purchase_price_minor'],
            'price_minor' => $retail,
            'currency' => strtoupper((string) ($request->user()->tenant?->default_currency ?: 'IRT')),
            'status' => 'publish',
            'type' => 'simple',
            'catalog_visibility' => 'visible',
            'stock_status' => 'instock',
            'is_available' => true,
        ]);

        if ($categoryId > 0) {
            $product->categories()->sync([$categoryId]);
        }
        if ($brandId > 0) {
            $product->brands()->sync([$brandId]);
        }

        return response()->json(['data' => $product->fresh(['categories', 'brands'])], 201);
    }

    public function bulkProducts(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = Product::query()
            ->where('tenant_id', $tid)
            ->where('status', '!=', 'trash')
            ->with(['variants', 'brands', 'categories', 'category']);

        if ($search = $request->query('search')) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)->orWhere('sku', 'like', $like);
            });
        }
        if ($request->filled('category_id')) {
            $cid = (int) $request->query('category_id');
            $q->where(fn ($w) => $w->where('category_id', $cid)->orWhereHas('categories', fn ($c) => $c->where('categories.id', $cid)));
        }
        if ($request->filled('brand_id')) {
            $q->whereHas('brands', fn ($b) => $b->where('brands.id', (int) $request->query('brand_id')));
        }
        if ($request->filled('stock_status')) {
            $q->where('stock_status', $request->query('stock_status'));
        }
        if ($request->filled('type')) {
            $q->where('type', $request->query('type'));
        }
        if ($request->boolean('locked')) {
            $q->where('lock_price', true);
        }
        if ($request->boolean('has_purchase')) {
            $q->whereNotNull('purchase_price_minor')->where('purchase_price_minor', '>', 0);
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 50)));
        $paginator = $q->orderBy('name')->paginate($perPage);
        $calc = PricingCalculator::forTenant($tid);

        $items = collect($paginator->items())->map(function (Product $p) use ($calc) {
            $row = $p->toArray();
            $row['calculated'] = $p->purchase_price_minor
                ? $calc->derived((float) $p->purchase_price_minor, $p)
                : null;

            return $row;
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function patchPurchase(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate(['purchase_price_minor' => ['required', 'integer', 'min:0']]);
        $product->update(['purchase_price_minor' => $data['purchase_price_minor']]);
        if (! $product->lock_price) {
            $calc = PricingCalculator::forTenant($product->tenant_id);
            $product->update([
                'price_minor' => (int) round($calc->calculate((float) $data['purchase_price_minor'], 'retail')),
            ]);
        }

        return response()->json(['data' => $product->fresh()]);
    }

    public function patchWcPrice(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'price_minor' => ['sometimes', 'integer', 'min:0'],
            'sale_price_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);
        if ($product->lock_price) {
            return response()->json(['message' => 'Price is locked'], 422);
        }
        $product->update($data);

        return response()->json(['data' => $product->fresh()]);
    }

    public function patchStock(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'stock' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'stock_status' => ['sometimes', 'string', 'in:instock,outofstock,onbackorder'],
            'manage_stock' => ['sometimes', 'boolean'],
        ]);
        $product->update($data);

        return response()->json(['data' => $product->fresh()]);
    }

    public function patchLock(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate(['lock_price' => ['required', 'boolean']]);
        $product->update($data);

        return response()->json(['data' => $product->fresh()]);
    }

    public function patchWholesale(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate(['wholesale_rule' => ['required', 'nullable', 'array']]);
        $product->update(['wholesale_rule' => $data['wholesale_rule']]);

        return response()->json(['data' => $product->fresh()]);
    }

    public function patchProductWfcp(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'purchase_price_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'lock_price' => ['sometimes', 'boolean'],
            'reference_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'wholesale_rule' => ['sometimes', 'nullable', 'array'],
            'platform_prices' => ['sometimes', 'nullable', 'array'],
        ]);
        $product->update($data);
        if (array_key_exists('purchase_price_minor', $data) && ! ($data['lock_price'] ?? $product->lock_price)) {
            if ($data['purchase_price_minor']) {
                $calc = PricingCalculator::forTenant($product->tenant_id);
                $product->update([
                    'price_minor' => (int) round($calc->calculate((float) $data['purchase_price_minor'], 'retail')),
                ]);
            }
        }

        $fresh = $product->fresh();
        $payload = $fresh->toArray();
        if ($fresh->purchase_price_minor) {
            $payload['calculated'] = PricingCalculator::forTenant($fresh->tenant_id)->derived((float) $fresh->purchase_price_minor, $fresh);
        }

        return response()->json(['data' => $payload]);
    }

    public function bulkPriceStart(Request $request, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'change_type' => ['required', 'string', 'in:fixed,percent'],
            'direction' => ['nullable', 'string', 'in:increase,decrease'],
            'value' => ['required', 'numeric', 'min:0'],
            'fields' => ['nullable', 'array'],
            'fields.*' => ['string', 'in:price_minor,sale_price_minor'],
            'apply_to_sale' => ['nullable', 'boolean'],
            'apply_to_variants' => ['nullable', 'boolean'],
            'dry_run' => ['nullable', 'boolean'],
            'rounding' => ['nullable', 'boolean'],
            'round_step' => ['nullable', 'integer', 'min:1'],
            'filters' => ['nullable', 'array'],
            'category_slugs' => ['nullable'],
            'category_ids' => ['nullable', 'array'],
            'brand_ids' => ['nullable', 'array'],
            'tag_ids' => ['nullable', 'array'],
            'status' => ['nullable', 'string'],
            'type' => ['nullable', 'string'],
            'stock_status' => ['nullable', 'string'],
            'stock_min' => ['nullable', 'integer'],
            'stock_max' => ['nullable', 'integer'],
            'is_featured' => ['nullable', 'boolean'],
            'on_sale' => ['nullable', 'boolean'],
            'has_variants' => ['nullable', 'boolean'],
            'include_locked' => ['nullable', 'boolean'],
            'sku' => ['nullable', 'string'],
            'search' => ['nullable', 'string'],
            'catalog_visibility' => ['nullable', 'string'],
            'created_from' => ['nullable', 'date'],
            'created_to' => ['nullable', 'date'],
            'updated_from' => ['nullable', 'date'],
            'updated_to' => ['nullable', 'date'],
            'price_min' => ['nullable', 'integer'],
            'price_max' => ['nullable', 'integer'],
        ]);

        try {
            $job = $bulk->createJob($request->user()->tenant_id, $data);
            // Kick first batches inline so the UI shows progress without waiting for cron.
            $bulk->processJobId($job->id, BulkPriceChangeService::BATCH_SIZE, 2);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Bulk price change failed', 'error' => $e->getMessage()], 500);
        }

        return response()->json(['data' => $bulk->serializeJob($job->fresh())]);
    }

    public function bulkPriceScheduleShow(Request $request, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        $row = \App\Models\PricingSetting::query()->where('tenant_id', $request->user()->tenant_id)->first();
        $payload = is_array($row?->payload) ? $row->payload : [];

        return response()->json(['data' => $this->normalizeBulkSchedule($payload['bulk_price_schedule'] ?? [], $bulk)]);
    }

    public function bulkPriceScheduleSave(Request $request, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'change_type' => ['required', 'string', 'in:fixed,percent'],
            'direction' => ['nullable', 'string', 'in:increase,decrease'],
            'value' => ['required', 'numeric'],
            'fields' => ['nullable', 'array'],
            'fields.*' => ['string', 'in:price_minor,sale_price_minor'],
            'apply_to_sale' => ['nullable', 'boolean'],
            'apply_to_variants' => ['nullable', 'boolean'],
            'filters' => ['nullable', 'array'],
            'category_slugs' => ['nullable', 'array'],
            'category_slugs.*' => ['string'],
            'rounding' => ['nullable', 'boolean'],
            'round_step' => ['nullable', 'integer', 'min:1'],
            'frequency' => ['required', 'string', 'in:daily,weekly'],
            'hour' => ['required', 'integer', 'min:0', 'max:23'],
            'weekday' => ['nullable', 'integer', 'min:0', 'max:6'],
        ]);
        $tid = $request->user()->tenant_id;
        $row = PricingSettings::row($tid);
        $payload = is_array($row->payload) ? $row->payload : [];
        $prev = is_array($payload['bulk_price_schedule'] ?? null) ? $payload['bulk_price_schedule'] : [];
        $payload['bulk_price_schedule'] = $this->normalizeBulkSchedule([
            ...$prev,
            ...$data,
            'last_run_at' => $prev['last_run_at'] ?? null,
        ], $bulk);
        $row->update(['payload' => $payload]);

        return response()->json(['data' => $payload['bulk_price_schedule']]);
    }

    public function bulkPriceState(Request $request, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $job = BulkPriceJob::query()->where('tenant_id', $tid)->latest('id')->first();

        return response()->json(['data' => $job ? $bulk->serializeJob($job) : null]);
    }

    public function bulkPriceJobs(Request $request, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $jobs = BulkPriceJob::query()
            ->where('tenant_id', $tid)
            ->latest('id')
            ->limit(20)
            ->get()
            ->map(fn (BulkPriceJob $j) => $bulk->serializeJob($j));

        return response()->json(['data' => $jobs]);
    }

    public function bulkPricePause(Request $request, BulkPriceJob $job, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        abort_if($job->tenant_id !== $request->user()->tenant_id, 403);

        return response()->json(['data' => $bulk->serializeJob($bulk->pause($job))]);
    }

    public function bulkPriceResume(Request $request, BulkPriceJob $job, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        abort_if($job->tenant_id !== $request->user()->tenant_id, 403);
        try {
            $fresh = $bulk->resume($job);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
        $bulk->processJobId($fresh->id, BulkPriceChangeService::BATCH_SIZE, 2);

        return response()->json(['data' => $bulk->serializeJob($fresh->fresh())]);
    }

    public function bulkPriceCancel(Request $request, BulkPriceJob $job, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        abort_if($job->tenant_id !== $request->user()->tenant_id, 403);

        return response()->json(['data' => $bulk->serializeJob($bulk->cancel($job))]);
    }

    public function bulkPricePreview(Request $request, BulkPriceChangeService $bulk): \Illuminate\Http\JsonResponse
    {
        $filters = array_merge(
            $request->query(),
            is_array($request->input('filters')) ? $request->input('filters') : []
        );

        return response()->json(['data' => $bulk->preview($request->user()->tenant_id, $filters)]);
    }

    /** @param  array<string, mixed>  $raw */
    public function normalizeBulkSchedule(array $raw, ?BulkPriceChangeService $bulk = null): array
    {
        $bulk ??= app(BulkPriceChangeService::class);
        $params = $bulk->normalizeParams($raw);

        return [
            'enabled' => (bool) ($raw['enabled'] ?? false),
            'change_type' => $params['change_type'],
            'direction' => $params['direction'],
            'value' => $params['value'],
            'fields' => $params['fields'],
            'apply_to_sale' => $params['apply_to_sale'],
            'apply_to_variants' => $params['apply_to_variants'],
            'filters' => $params['filters'],
            'category_slugs' => $params['filters']['category_slugs'],
            'rounding' => $params['rounding'],
            'round_step' => $params['round_step'],
            'frequency' => ($raw['frequency'] ?? 'daily') === 'weekly' ? 'weekly' : 'daily',
            'hour' => max(0, min(23, (int) ($raw['hour'] ?? 3))),
            'weekday' => max(0, min(6, (int) ($raw['weekday'] ?? 0))),
            'last_run_at' => $raw['last_run_at'] ?? null,
        ];
    }

    /** @deprecated Prefer BulkPriceChangeService::processJobId — kept for schedule command compatibility. */
    public function runBulkPriceJob(BulkPriceJob $job): void
    {
        app(BulkPriceChangeService::class)->processJobId(
            $job->id,
            BulkPriceChangeService::BATCH_SIZE,
            500
        );
    }
}
