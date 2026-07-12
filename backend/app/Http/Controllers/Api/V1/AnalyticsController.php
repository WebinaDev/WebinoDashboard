<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AnalyticsController extends Controller
{
    public function summary(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $cacheKey = "analytics:summary:tenant:{$tid}";

        $data = Cache::remember($cacheKey, 30, function () use ($tid) {
            return [
                'orders_open' => Order::query()
                    ->where('tenant_id', $tid)
                    ->whereIn('status', ['pending_payment', 'processing'])
                    ->count(),
                'orders_paid' => Order::query()
                    ->where('tenant_id', $tid)
                    ->where('status', 'paid')
                    ->count(),
                'products' => Product::query()->where('tenant_id', $tid)->count(),
                'revenue_minor' => Order::query()
                    ->where('tenant_id', $tid)
                    ->where('status', 'paid')
                    ->sum('total_minor'),
            ];
        });

        return response()->json(['data' => $data])
            ->header('Cache-Control', 'private, max-age=30');
    }
}
