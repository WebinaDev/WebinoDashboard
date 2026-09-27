<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductReview;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class ProductReviewController extends Controller
{
    use ResolvesPublicTenant;

    public function publicIndex(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $settings = ShopSettings::getReviews($tid);
        if (empty($settings['enabled'])) {
            return response()->json(['data' => ['items' => [], 'average' => null, 'count' => 0]]);
        }

        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->firstOrFail();
        $items = ProductReview::query()
            ->where('tenant_id', $tid)
            ->where('product_id', $product->id)
            ->where('status', 'approved')
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'rating', 'body', 'author_name', 'created_at']);

        $avg = null;
        $count = (int) ProductReview::query()
            ->where('product_id', $product->id)
            ->where('status', 'approved')
            ->count();
        if (! empty($settings['show_average']) && $count > 0) {
            $avg = round((float) ProductReview::query()
                ->where('product_id', $product->id)
                ->where('status', 'approved')
                ->avg('rating'), 2);
        }

        return response()->json(['data' => ['items' => $items, 'average' => $avg, 'count' => $count]]);
    }

    public function publicStore(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $settings = ShopSettings::getReviews($tid);
        if (empty($settings['enabled'])) {
            return response()->json(['message' => 'Reviews disabled'], 422);
        }

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'body' => ['nullable', 'string', 'max:2000'],
            'author_name' => ['nullable', 'string', 'max:120'],
        ]);

        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->firstOrFail();
        $user = $request->user('sanctum');

        if (! empty($settings['verified_buyer_only'])) {
            if (! $user) {
                return response()->json(['message' => 'Login required'], 401);
            }
            $bought = OrderItem::query()
                ->where('product_id', $product->id)
                ->whereHas('order', fn ($q) => $q->where('tenant_id', $tid)
                    ->where('user_id', $user->id)
                    ->whereIn('status', ['paid', 'processing', 'shipped', 'completed']))
                ->exists();
            if (! $bought) {
                return response()->json(['message' => 'Verified buyer only'], 403);
            }
        }

        $status = ! empty($settings['require_approval']) ? 'pending' : 'approved';
        $review = ProductReview::query()->create([
            'tenant_id' => $tid,
            'product_id' => $product->id,
            'user_id' => $user?->id,
            'rating' => (int) $data['rating'],
            'body' => $data['body'] ?? null,
            'author_name' => $data['author_name'] ?? ($user?->name),
            'status' => $status,
        ]);

        return response()->json(['data' => $review], 201);
    }

    public function adminIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $status = $request->query('status', 'pending');
        $q = ProductReview::query()->where('tenant_id', $tid)->with('product:id,name,slug')->orderByDesc('id');
        if ($status !== 'all') {
            $q->where('status', $status);
        }

        return response()->json(['data' => $q->limit(100)->get()]);
    }

    public function moderate(Request $request, ProductReview $review): \Illuminate\Http\JsonResponse
    {
        abort_unless((int) $review->tenant_id === (int) $request->user()->tenant_id, 404);
        $data = $request->validate([
            'status' => ['required', 'string', 'in:approved,rejected,pending'],
        ]);
        $review->update(['status' => $data['status']]);

        return response()->json(['data' => $review]);
    }
}
