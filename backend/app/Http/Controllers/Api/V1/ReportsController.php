<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportsController extends Controller
{
    public function overview(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $paid = Order::query()->where('tenant_id', $tid)->where('status', 'paid')->count();
        $pending = Order::query()->where('tenant_id', $tid)->where('status', 'pending_payment')->count();
        $totalOrders = Order::query()->where('tenant_id', $tid)->count();
        $conversion = $totalOrders > 0 ? round($paid / $totalOrders, 4) : null;

        $topProducts = OrderItem::query()
            ->select('product_id', DB::raw('SUM(quantity) as units_sold'))
            ->whereHas('order', fn ($q) => $q->where('tenant_id', $tid)->where('status', 'paid'))
            ->groupBy('product_id')
            ->orderByDesc('units_sold')
            ->limit(5)
            ->get()
            ->map(function ($row) {
                $p = Product::query()->find($row->product_id);

                return [
                    'product_id' => $row->product_id,
                    'name' => $p?->name,
                    'units_sold' => (int) $row->units_sold,
                ];
            });

        return response()->json([
            'data' => [
                'orders_paid' => $paid,
                'orders_pending_payment' => $pending,
                'orders_total' => $totalOrders,
                'conversion_rate_paid_over_total' => $conversion,
                'top_products' => $topProducts,
            ],
        ]);
    }
}
