<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class AiRecommendationController extends Controller
{
    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'product_ids' => ['nullable', 'array'],
            'product_ids.*' => ['integer'],
        ]);

        $tid = $request->user()->tenant_id;

        $recommended = Product::query()
            ->where('tenant_id', $tid)
            ->when(! empty($data['product_ids']), fn ($q) => $q->whereNotIn('id', $data['product_ids']))
            ->orderByDesc('stock')
            ->limit(5)
            ->pluck('id')
            ->values()
            ->all();

        return response()->json([
            'data' => [
                'recommended_product_ids' => $recommended,
            ],
        ]);
    }
}
