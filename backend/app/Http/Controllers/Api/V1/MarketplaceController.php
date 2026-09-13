<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MarketplaceController extends Controller
{
    public const PLATFORMS = ['digikala', 'basalam', 'technolife', 'tapsishop', 'snappshop'];

    public function maps(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $existing = MarketplaceProductMap::query()
            ->where('product_id', $product->id)
            ->whereNull('product_variant_id')
            ->get()
            ->keyBy('platform');

        $rows = [];
        foreach (self::PLATFORMS as $platform) {
            $map = $existing->get($platform);
            $adapter = MarketplaceAdapterRegistry::get($platform);
            $rows[] = [
                'platform' => $platform,
                'remote_product_id' => $map?->remote_product_id,
                'remote_variant_id' => $map?->remote_variant_id,
                'remote_url' => $map?->remote_url,
                'sync_enabled' => (bool) ($map?->sync_enabled),
                'last_sync_at' => $map?->last_sync_at,
                'last_error' => $map?->last_error,
                'can_create' => $adapter->canCreate(),
                'can_find_variants' => $adapter->canFindVariants(),
            ];
        }

        return response()->json(['data' => $rows]);
    }

    public function saveMaps(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'maps' => ['required', 'array'],
            'maps.*.platform' => ['required', 'string', Rule::in(self::PLATFORMS)],
            'maps.*.remote_product_id' => ['nullable', 'string', 'max:255'],
            'maps.*.remote_variant_id' => ['nullable', 'string', 'max:255'],
            'maps.*.remote_url' => ['nullable', 'string', 'max:2048'],
            'maps.*.sync_enabled' => ['nullable', 'boolean'],
        ]);

        foreach ($data['maps'] as $row) {
            $empty = empty($row['remote_product_id']) && empty($row['remote_variant_id']) && empty($row['remote_url']);
            if ($empty) {
                MarketplaceProductMap::query()
                    ->where('product_id', $product->id)
                    ->where('platform', $row['platform'])
                    ->whereNull('product_variant_id')
                    ->delete();
                continue;
            }
            MarketplaceProductMap::query()->updateOrCreate(
                [
                    'product_id' => $product->id,
                    'product_variant_id' => null,
                    'platform' => $row['platform'],
                ],
                [
                    'tenant_id' => $product->tenant_id,
                    'remote_product_id' => $row['remote_product_id'] ?? null,
                    'remote_variant_id' => $row['remote_variant_id'] ?? null,
                    'remote_url' => $row['remote_url'] ?? null,
                    'sync_enabled' => $row['sync_enabled'] ?? false,
                ]
            );
        }

        return $this->maps($request, $product);
    }

    public function syncNow(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $maps = MarketplaceProductMap::query()
            ->where('product_id', $product->id)
            ->where('sync_enabled', true)
            ->get();

        $results = [];
        foreach ($maps as $map) {
            $adapter = MarketplaceAdapterRegistry::get($map->platform);
            $result = $adapter->syncPriceStock($product, $map);
            $map->update([
                'last_sync_at' => now(),
                'last_error' => $result['error'] ?? null,
                'remote_price' => $result['remote_price'] ?? $map->remote_price,
                'remote_stock' => $result['remote_stock'] ?? $map->remote_stock,
            ]);
            $results[] = ['platform' => $map->platform, 'ok' => empty($result['error']), 'error' => $result['error'] ?? null];
        }

        return response()->json(['data' => ['synced' => count($results), 'results' => $results]]);
    }

    public function createRemote(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate(['platform' => ['required', 'string', Rule::in(self::PLATFORMS)]]);
        $adapter = MarketplaceAdapterRegistry::get($data['platform']);
        $result = $adapter->createRemote($product);
        if (! empty($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        MarketplaceProductMap::query()->updateOrCreate(
            [
                'product_id' => $product->id,
                'product_variant_id' => null,
                'platform' => $data['platform'],
            ],
            [
                'tenant_id' => $product->tenant_id,
                'remote_product_id' => $result['remote_product_id'] ?? null,
                'remote_variant_id' => $result['remote_variant_id'] ?? null,
                'remote_url' => $result['remote_url'] ?? null,
                'sync_enabled' => true,
            ]
        );

        return $this->maps($request, $product);
    }

    public function digikalaMap(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'dkp' => ['required', 'string'],
            'variant_id' => ['nullable', 'string'],
        ]);
        $adapter = MarketplaceAdapterRegistry::get('digikala');
        $result = $adapter->resolveProduct($data['dkp'], $data['variant_id'] ?? null);
        if (! empty($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        MarketplaceProductMap::query()->updateOrCreate(
            [
                'product_id' => $product->id,
                'product_variant_id' => null,
                'platform' => 'digikala',
            ],
            [
                'tenant_id' => $product->tenant_id,
                'remote_product_id' => $result['remote_product_id'] ?? $data['dkp'],
                'remote_variant_id' => $result['remote_variant_id'] ?? ($data['variant_id'] ?? null),
                'remote_url' => $result['remote_url'] ?? ('https://www.digikala.com/product/dkp-'.$data['dkp']),
            ]
        );

        return response()->json(['data' => $result]);
    }
}
