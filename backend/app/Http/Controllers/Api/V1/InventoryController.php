<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    private const LOW_STOCK_THRESHOLD = 10;

    public function summary(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $lowStock = Product::query()
            ->where('tenant_id', $tid)
            ->where('stock', '>', 0)
            ->where('stock', '<', self::LOW_STOCK_THRESHOLD)
            ->orderBy('stock')
            ->limit(50)
            ->get(['id', 'name', 'sku', 'stock', 'price_minor', 'currency']);

        $outOfStock = Product::query()
            ->where('tenant_id', $tid)
            ->where('stock', '=', 0)
            ->count();

        return response()->json([
            'data' => [
                'low_stock_threshold' => self::LOW_STOCK_THRESHOLD,
                'low_stock_products' => $lowStock,
                'out_of_stock_count' => $outOfStock,
                'shipments_pending' => 0,
            ],
        ]);
    }
}
