<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function summary(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $products = ShopSettings::getProducts($tid);
        $threshold = max(0, (int) ($products['low_stock_threshold'] ?? 2));

        $lowStock = Product::query()
            ->where('tenant_id', $tid)
            ->where('stock', '>', 0)
            ->where('stock', '<=', $threshold)
            ->orderBy('stock')
            ->limit(50)
            ->get(['id', 'name', 'sku', 'stock', 'price_minor', 'currency']);

        $outOfStock = Product::query()
            ->where('tenant_id', $tid)
            ->where(function ($q) {
                $q->where('stock', '=', 0)->orWhere('stock_status', 'outofstock');
            })
            ->count();

        return response()->json([
            'data' => [
                'low_stock_threshold' => $threshold,
                'low_stock_products' => $lowStock,
                'out_of_stock_count' => $outOfStock,
                'shipments_pending' => 0,
            ],
        ]);
    }
}
