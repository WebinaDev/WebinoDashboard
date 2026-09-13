<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BulkPriceJob;
use App\Models\PricingSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Pricing\PricingCalculator;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PricingController extends Controller
{
    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = PricingSetting::query()->firstOrCreate(
            ['tenant_id' => $tid],
            ['payload' => PricingCalculator::defaultSettings()]
        );

        return response()->json(['data' => $row->payload]);
    }

    public function updateSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate(['payload' => ['required', 'array']]);
        $row = PricingSetting::query()->updateOrCreate(
            ['tenant_id' => $tid],
            ['payload' => $data['payload']]
        );

        return response()->json(['data' => $row->payload]);
    }

    public function calculate(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'purchase_price_minor' => ['required', 'numeric', 'min:0'],
            'type' => ['nullable', 'string'],
            'months' => ['nullable', 'integer', 'min:1'],
        ]);
        $calc = PricingCalculator::forTenant($request->user()->tenant_id);
        $purchase = (float) $data['purchase_price_minor'];

        return response()->json([
            'data' => $calc->derived($purchase),
        ]);
    }

    public function quickAdd(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'purchase_price_minor' => ['required', 'integer', 'min:1'],
            'image_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $calc = PricingCalculator::forTenant($tid);
        $retail = (int) round($calc->calculate((float) $data['purchase_price_minor'], 'retail'));
        $slug = Str::slug($data['name']) ?: 'product';
        $base = $slug;
        $i = 1;
        while (Product::query()->where('tenant_id', $tid)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        $product = Product::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
            'image_url' => $data['image_url'] ?? null,
            'purchase_price_minor' => $data['purchase_price_minor'],
            'price_minor' => $retail,
            'currency' => 'IRR',
            'status' => 'publish',
            'type' => 'simple',
            'catalog_visibility' => 'visible',
            'stock_status' => 'instock',
            'is_available' => true,
        ]);

        return response()->json(['data' => $product], 201);
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
                ? $calc->derived((float) $p->purchase_price_minor)
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
            $payload['calculated'] = PricingCalculator::forTenant($fresh->tenant_id)->derived((float) $fresh->purchase_price_minor);
        }

        return response()->json(['data' => $payload]);
    }

    public function bulkPriceStart(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $running = BulkPriceJob::query()->where('tenant_id', $tid)->where('locked', true)->whereIn('status', ['pending', 'running'])->exists();
        if ($running) {
            return response()->json(['message' => 'A bulk price job is already running'], 409);
        }

        $data = $request->validate([
            'change_type' => ['required', 'string', 'in:fixed,percent'],
            'value' => ['required', 'numeric'],
            'apply_to_sale' => ['nullable', 'boolean'],
            'category_slugs' => ['nullable', 'string'],
            'range_rules' => ['nullable', 'string'],
            'combine_rules' => ['nullable', 'boolean'],
            'rounding' => ['nullable', 'boolean'],
            'round_threshold' => ['nullable', 'integer'],
            'round_step' => ['nullable', 'integer'],
        ]);

        $job = BulkPriceJob::query()->create([
            'tenant_id' => $tid,
            'status' => 'running',
            'params' => $data,
            'state' => ['processed' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0],
            'locked' => true,
            'last_log' => 'Job started',
        ]);

        $this->runBulkPriceJob($job);

        return response()->json(['data' => $job->fresh()]);
    }

    public function bulkPriceState(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $job = BulkPriceJob::query()->where('tenant_id', $tid)->latest('id')->first();

        return response()->json([
            'data' => $job ? [
                'status' => $job->status,
                'locked' => $job->locked,
                'params' => $job->params,
                'state' => $job->state,
                'last_log' => $job->last_log,
            ] : null,
        ]);
    }

    protected function runBulkPriceJob(BulkPriceJob $job): void
    {
        $params = $job->params ?? [];
        $tid = $job->tenant_id;
        $q = Product::query()->where('tenant_id', $tid)->where('status', 'publish');

        if (! empty($params['category_slugs'])) {
            $slugs = array_filter(array_map('trim', explode(',', (string) $params['category_slugs'])));
            if ($slugs) {
                $q->where(function ($w) use ($slugs) {
                    $w->whereHas('category', fn ($c) => $c->whereIn('slug', $slugs))
                        ->orWhereHas('categories', fn ($c) => $c->whereIn('categories.slug', $slugs));
                });
            }
        }

        $products = $q->get();
        $updated = 0;
        $skipped = 0;
        $changeType = $params['change_type'] ?? 'percent';
        $value = (float) ($params['value'] ?? 0);
        $applySale = (bool) ($params['apply_to_sale'] ?? false);
        $round = (bool) ($params['rounding'] ?? false);
        $step = max(1, (int) ($params['round_step'] ?? 1000));

        foreach ($products as $product) {
            if ($product->lock_price) {
                $skipped++;
                continue;
            }
            $price = (float) $product->price_minor;
            $new = $changeType === 'fixed' ? $price + $value : $price + ($price * $value / 100);
            if ($round) {
                $new = round($new / $step) * $step;
            }
            $fields = ['price_minor' => (int) max(0, $new)];
            if ($applySale && $product->sale_price_minor) {
                $sale = (float) $product->sale_price_minor;
                $newSale = $changeType === 'fixed' ? $sale + $value : $sale + ($sale * $value / 100);
                if ($round) {
                    $newSale = round($newSale / $step) * $step;
                }
                $fields['sale_price_minor'] = (int) max(0, $newSale);
            }
            $product->update($fields);
            $updated++;
        }

        $job->update([
            'status' => 'done',
            'locked' => false,
            'state' => [
                'processed' => $products->count(),
                'updated' => $updated,
                'skipped' => $skipped,
                'total' => $products->count(),
            ],
            'last_log' => "Updated {$updated}, skipped {$skipped}",
        ]);
    }
}
