<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProductFeedback;
use App\Models\ProductLike;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CafeEngagementInboxController extends Controller
{
    public function feedback(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = ProductFeedback::query()
            ->where('tenant_id', $tid)
            ->latest()
            ->limit(100)
            ->get();

        $productNames = DB::table('products')
            ->whereIn('id', $rows->pluck('product_id')->filter()->unique())
            ->pluck('name', 'id');

        $data = $rows->map(function (ProductFeedback $row) use ($productNames) {
            return [
                'id' => $row->id,
                'product_id' => $row->product_id,
                'product_name' => $productNames[$row->product_id] ?? null,
                'rating' => $row->rating,
                'comment' => $row->comment,
                'guest_phone' => $row->guest_phone,
                'created_at' => $row->created_at,
            ];
        });

        return response()->json(['data' => $data]);
    }

    public function likes(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = ProductLike::query()
            ->select('product_id', DB::raw('count(*) as likes_count'))
            ->where('tenant_id', $tid)
            ->groupBy('product_id')
            ->orderByDesc('likes_count')
            ->limit(40)
            ->get();

        $names = DB::table('products')->whereIn('id', $rows->pluck('product_id'))->pluck('name', 'id');
        $data = $rows->map(fn ($row) => [
            'product_id' => $row->product_id,
            'product_name' => $names[$row->product_id] ?? null,
            'likes_count' => (int) $row->likes_count,
        ]);

        return response()->json(['data' => $data]);
    }
}
