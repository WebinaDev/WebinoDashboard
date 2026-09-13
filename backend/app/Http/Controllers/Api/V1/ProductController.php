<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductTag;
use App\Services\Pricing\PricingCalculator;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = Product::query()
            ->where('tenant_id', $tid)
            ->with(['category', 'categories', 'brands', 'tags', 'variants', 'media', 'allergens', 'modifiers.options']);

        if ($search = $request->query('search')) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('sku', 'like', $like)
                    ->orWhere('slug', 'like', $like);
            });
        }
        if ($request->filled('status')) {
            $q->where('status', $request->query('status'));
        }
        if ($request->filled('type')) {
            $q->where('type', $request->query('type'));
        }
        if ($request->filled('stock_status')) {
            $q->where('stock_status', $request->query('stock_status'));
        }
        if ($request->filled('category_id')) {
            $cid = (int) $request->query('category_id');
            $q->where(function ($w) use ($cid) {
                $w->where('category_id', $cid)->orWhereHas('categories', fn ($c) => $c->where('categories.id', $cid));
            });
        }
        if ($request->filled('brand_id')) {
            $q->whereHas('brands', fn ($b) => $b->where('brands.id', (int) $request->query('brand_id')));
        }
        if ($request->filled('catalog_visibility')) {
            $q->where('catalog_visibility', $request->query('catalog_visibility'));
        }

        $sort = $request->query('sort', 'sort_order');
        $dir = $request->query('dir', 'asc') === 'desc' ? 'desc' : 'asc';
        if (in_array($sort, ['name', 'price_minor', 'created_at', 'sort_order', 'stock'], true)) {
            $q->orderBy($sort, $dir);
        } else {
            $q->orderBy('sort_order')->orderBy('name');
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        if ($request->boolean('paginate', true) && $request->has('page')) {
            $paginator = $q->paginate($perPage);

            return response()->json([
                'data' => $paginator->items(),
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                ],
            ]);
        }

        return response()->json(['data' => $q->get()]);
    }

    public function show(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $product->load([
            'category', 'categories', 'brands', 'tags', 'variants', 'media',
            'allergens', 'modifiers.options', 'marketplaceMaps', 'coffeeProfile', 'attributes',
        ]);

        $payload = $product->toArray();
        if ($product->purchase_price_minor) {
            $calc = PricingCalculator::forTenant($product->tenant_id);
            $payload['calculated'] = $calc->derived((float) $product->purchase_price_minor);
        }

        return response()->json(['data' => $payload]);
    }

    public function lookup(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'ishop_labels' => [
                    ['key' => 'check_purchase', 'label' => 'بررسی قبل از خرید'],
                    ['key' => 'installment_purchase', 'label' => 'خرید اقساطی'],
                    ['key' => 'credit_purchase', 'label' => 'خرید اعتباری'],
                    ['key' => 'original_product', 'label' => 'کالای اصل'],
                    ['key' => 'non_original_product', 'label' => 'غیراصل'],
                    ['key' => 'has_warranty', 'label' => 'دارای گارانتی'],
                ],
                'categories' => \App\Models\Category::query()->where('tenant_id', $tid)->orderBy('name')->get(['id', 'name', 'slug', 'parent_id']),
                'brands' => \App\Models\Brand::query()->where('tenant_id', $tid)->orderBy('name')->get(['id', 'name', 'slug', 'parent_id']),
                'tags' => ProductTag::query()->where('tenant_id', $tid)->orderBy('name')->get(['id', 'name', 'slug']),
                'attributes' => \App\Models\ProductAttribute::query()->where('tenant_id', $tid)->with('terms')->orderBy('name')->get(),
            ],
        ]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $this->validateProduct($request, $tid, false);
        $slug = $this->ensureUniqueSlug($tid, $data['slug'] ?? Str::slug($data['name']));

        $product = Product::query()->create(array_merge(
            $this->mapProductFields($data, $tid),
            ['tenant_id' => $tid, 'slug' => $slug]
        ));

        $this->syncRelations($product, $data);

        if (! empty($data['purchase_price_minor']) && empty($data['lock_price'])) {
            $this->syncRetailFromPurchase($product);
        }

        return response()->json([
            'data' => $product->fresh()->load(['category', 'categories', 'brands', 'tags', 'variants']),
        ], 201);
    }

    public function update(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $tid = $product->tenant_id;
        $data = $this->validateProduct($request, $tid, true);

        if (isset($data['slug'])) {
            $data['slug'] = $this->ensureUniqueSlug($tid, $data['slug'], $product->id);
        } elseif (isset($data['name']) && ! $product->slug) {
            $data['slug'] = $this->ensureUniqueSlug($tid, Str::slug($data['name']), $product->id);
        }

        $product->update($this->mapProductFields($data, $tid, true));
        $this->syncRelations($product, $data);

        if (array_key_exists('purchase_price_minor', $data) && ! ($data['lock_price'] ?? $product->lock_price)) {
            $this->syncRetailFromPurchase($product->fresh());
        }

        return response()->json([
            'data' => $product->fresh()->load([
                'category', 'categories', 'brands', 'tags', 'variants', 'media',
                'allergens', 'modifiers.options', 'marketplaceMaps', 'coffeeProfile', 'attributes',
            ]),
        ]);
    }

    public function duplicate(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $copy = $product->replicate(['slug']);
        $copy->name = $product->name.' (کپی)';
        $copy->slug = $this->ensureUniqueSlug($product->tenant_id, $product->slug.'-copy');
        $copy->status = 'draft';
        $copy->save();

        $copy->categories()->sync($product->categories()->pluck('categories.id'));
        $copy->brands()->sync($product->brands()->pluck('brands.id'));
        $copy->tags()->sync($product->tags()->pluck('product_tags.id'));

        return response()->json(['data' => $copy->load(['category', 'categories', 'brands'])], 201);
    }

    public function bulkUpdate(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $data = $request->validate([
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer'],
            'is_available' => ['sometimes', 'boolean'],
            'is_hidden' => ['sometimes', 'boolean'],
            'is_sold_out' => ['sometimes', 'boolean'],
            'discount_percent' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'menu_id' => ['sometimes', 'nullable', 'integer', Rule::exists('menus', 'id')->where('tenant_id', $tid)],
            'status' => ['sometimes', 'string', 'in:publish,draft,trash'],
        ]);

        $updates = collect($data)->except('product_ids')->filter(fn ($v) => $v !== null)->all();

        Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('id', $data['product_ids'])
            ->update($updates);

        $items = Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('id', $data['product_ids'])
            ->with(['category', 'variants'])
            ->get();

        return response()->json(['data' => $items]);
    }

    public function destroy(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $product->update(['status' => 'trash']);
        $product->delete();

        return response()->json([], 204);
    }

    public function syncAttributes(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'attributes' => ['required', 'array'],
            'attributes.*.id' => ['required', 'integer'],
            'attributes.*.is_visible' => ['nullable', 'boolean'],
            'attributes.*.is_variation' => ['nullable', 'boolean'],
            'attributes.*.position' => ['nullable', 'integer'],
            'attributes.*.term_ids' => ['nullable', 'array'],
            'attributes.*.custom_options' => ['nullable', 'array'],
        ]);

        $sync = [];
        foreach ($data['attributes'] as $i => $row) {
            $sync[$row['id']] = [
                'is_visible' => $row['is_visible'] ?? true,
                'is_variation' => $row['is_variation'] ?? false,
                'position' => $row['position'] ?? $i,
                'term_ids' => json_encode($row['term_ids'] ?? []),
                'custom_options' => json_encode($row['custom_options'] ?? []),
            ];
        }
        $product->attributes()->sync($sync);

        return response()->json(['data' => $product->fresh()->load('attributes')]);
    }

    /** @return array<string, mixed> */
    private function validateProduct(Request $request, int $tid, bool $partial): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'short_description' => ['nullable', 'string'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'cover_image_url' => ['nullable', 'string', 'max:2048'],
            'video_url' => ['nullable', 'string', 'max:2048'],
            'video_cover_url' => ['nullable', 'string', 'max:2048'],
            'sku' => ['nullable', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tid)],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer'],
            'brand_ids' => ['nullable', 'array'],
            'brand_ids.*' => ['integer'],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['integer'],
            'tag_names' => ['nullable', 'array'],
            'tag_names.*' => ['string', 'max:255'],
            'menu_id' => ['nullable', 'integer', Rule::exists('menus', 'id')->where('tenant_id', $tid)],
            'price_minor' => [$partial ? 'sometimes' : 'required', 'integer', 'min:0'],
            'sale_price_minor' => ['nullable', 'integer', 'min:0'],
            'currency' => ['nullable', 'string', 'max:8'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'is_available' => ['nullable', 'boolean'],
            'is_hidden' => ['nullable', 'boolean'],
            'is_new' => ['nullable', 'boolean'],
            'is_featured' => ['nullable', 'boolean'],
            'is_sold_out' => ['nullable', 'boolean'],
            'calories' => ['nullable', 'integer', 'min:0'],
            'spice_level' => ['nullable', 'integer', 'min:0', 'max:5'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'discount_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'meta' => ['nullable', 'array'],
            'status' => ['nullable', 'string', 'in:publish,draft,trash'],
            'type' => ['nullable', 'string', 'in:simple,variable'],
            'catalog_visibility' => ['nullable', 'string', 'in:visible,catalog,search,hidden'],
            'stock_status' => ['nullable', 'string', 'in:instock,outofstock,onbackorder'],
            'manage_stock' => ['nullable', 'boolean'],
            'weight' => ['nullable', 'numeric'],
            'length' => ['nullable', 'numeric'],
            'width' => ['nullable', 'numeric'],
            'height' => ['nullable', 'numeric'],
            'gallery' => ['nullable', 'array'],
            'english_name' => ['nullable', 'string', 'max:255'],
            'shipping_time' => ['nullable', 'integer', 'min:0'],
            'labels' => ['nullable', 'array'],
            'custom_labels' => ['nullable', 'array'],
            'initial_stock_quantity' => ['nullable', 'integer', 'min:0'],
            'ai_review_summary' => ['nullable', 'string'],
            'faqs' => ['nullable', 'array'],
            'purchase_price_minor' => ['nullable', 'integer', 'min:0'],
            'lock_price' => ['nullable', 'boolean'],
            'reference_url' => ['nullable', 'string', 'max:2048'],
            'reference_source' => ['nullable', 'string', 'max:255'],
            'wholesale_rule' => ['nullable', 'array'],
            'platform_prices' => ['nullable', 'array'],
            'related_ids' => ['nullable', 'array'],
            'upsell_ids' => ['nullable', 'array'],
            'cross_sell_ids' => ['nullable', 'array'],
        ]);
    }

    /** @param array<string, mixed> $data */
    private function mapProductFields(array $data, int $tid, bool $partial = false): array
    {
        $keys = [
            'name', 'slug', 'description', 'short_description', 'image_url', 'cover_image_url',
            'video_url', 'video_cover_url', 'sku', 'category_id', 'menu_id', 'price_minor',
            'sale_price_minor', 'currency', 'stock', 'is_available', 'is_hidden', 'is_new',
            'is_featured', 'is_sold_out', 'calories', 'spice_level', 'sort_order', 'discount_percent',
            'meta', 'status', 'type', 'catalog_visibility', 'stock_status', 'manage_stock',
            'weight', 'length', 'width', 'height', 'gallery', 'english_name', 'shipping_time',
            'labels', 'custom_labels', 'initial_stock_quantity', 'ai_review_summary', 'faqs',
            'purchase_price_minor', 'lock_price', 'reference_url', 'reference_source',
            'wholesale_rule', 'platform_prices', 'related_ids', 'upsell_ids', 'cross_sell_ids',
        ];

        $out = [];
        foreach ($keys as $key) {
            if (array_key_exists($key, $data)) {
                $out[$key] = $data[$key];
            }
        }

        if (! $partial) {
            $out['currency'] = $out['currency'] ?? 'IRR';
            $out['stock'] = $out['stock'] ?? 0;
            $out['is_available'] = $out['is_available'] ?? true;
            $out['is_hidden'] = $out['is_hidden'] ?? false;
            $out['is_new'] = $out['is_new'] ?? false;
            $out['is_featured'] = $out['is_featured'] ?? false;
            $out['is_sold_out'] = $out['is_sold_out'] ?? false;
            $out['spice_level'] = $out['spice_level'] ?? 0;
            $out['sort_order'] = $out['sort_order'] ?? 0;
            $out['discount_percent'] = $out['discount_percent'] ?? 0;
            $out['status'] = $out['status'] ?? 'publish';
            $out['type'] = $out['type'] ?? 'simple';
            $out['catalog_visibility'] = $out['catalog_visibility'] ?? 'visible';
            $out['stock_status'] = $out['stock_status'] ?? 'instock';
            $out['lock_price'] = $out['lock_price'] ?? false;
            $out['manage_stock'] = $out['manage_stock'] ?? false;
        }

        return $out;
    }

    /** @param array<string, mixed> $data */
    private function syncRelations(Product $product, array $data): void
    {
        if (array_key_exists('category_ids', $data)) {
            $product->categories()->sync($data['category_ids'] ?? []);
            if (! empty($data['category_ids']) && empty($data['category_id'])) {
                $product->update(['category_id' => $data['category_ids'][0]]);
            }
        }
        if (array_key_exists('brand_ids', $data)) {
            $product->brands()->sync($data['brand_ids'] ?? []);
        }
        if (array_key_exists('tag_ids', $data) || array_key_exists('tag_names', $data)) {
            $ids = $data['tag_ids'] ?? [];
            foreach ($data['tag_names'] ?? [] as $name) {
                $tag = ProductTag::query()->firstOrCreate(
                    ['tenant_id' => $product->tenant_id, 'slug' => Str::slug($name)],
                    ['name' => $name]
                );
                $ids[] = $tag->id;
            }
            $product->tags()->sync(array_unique($ids));
        }
    }

    private function syncRetailFromPurchase(Product $product): void
    {
        if (! $product->purchase_price_minor || $product->lock_price) {
            return;
        }
        $calc = PricingCalculator::forTenant($product->tenant_id);
        $retail = (int) round($calc->calculate((float) $product->purchase_price_minor, 'retail'));
        $product->update(['price_minor' => $retail]);
    }

    private function ensureUniqueSlug(int $tenantId, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'item';
        $candidate = $base;
        $i = 1;

        while (
            Product::query()
                ->where('tenant_id', $tenantId)
                ->where('slug', $candidate)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->exists()
        ) {
            $candidate = $base.'-'.$i;
            $i++;
        }

        return $candidate;
    }
}
