<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductReview;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->storefront()->firstOrFail();
        $items = ProductReview::query()
            ->where('tenant_id', $tid)
            ->where('product_id', $product->id)
            ->where('status', ProductReview::STATUS_APPROVED)
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'rating', 'body', 'author_name', 'created_at']);

        $avg = null;
        $count = (int) ProductReview::query()
            ->where('product_id', $product->id)
            ->where('status', ProductReview::STATUS_APPROVED)
            ->count();
        if (! empty($settings['show_average']) && $count > 0) {
            $avg = round((float) ProductReview::query()
                ->where('product_id', $product->id)
                ->where('status', ProductReview::STATUS_APPROVED)
                ->avg('rating'), 2);
        }

        return response()->json(['data' => ['items' => $items, 'average' => $avg, 'count' => $count]]);
    }

    public function publicStore(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $settings = ShopSettings::getReviews($tid);
        if (empty($settings['enabled'])) {
            return response()->json(['message' => 'reviews_disabled', 'errors' => ['code' => 'reviews_disabled']], 422);
        }

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'body' => ['nullable', 'string', 'max:2000'],
            'author_name' => ['nullable', 'string', 'max:120'],
        ]);

        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->storefront()->firstOrFail();
        $user = $request->user('sanctum');

        if (! empty($settings['verified_buyer_only'])) {
            if (! $user) {
                return response()->json(['message' => 'Login required'], 401);
            }
            if (! $this->userPurchasedProduct($tid, (int) $user->id, (int) $product->id)) {
                return response()->json(['message' => 'Verified buyer only'], 403);
            }
        }

        $status = ! empty($settings['require_approval']) ? ProductReview::STATUS_PENDING : ProductReview::STATUS_APPROVED;
        $review = ProductReview::query()->create([
            'tenant_id' => $tid,
            'product_id' => $product->id,
            'user_id' => $user?->id,
            'rating' => (int) $data['rating'],
            'body' => $data['body'] ?? null,
            'author_name' => $data['author_name'] ?? ($user?->name),
            'status' => $status,
        ]);

        if ($status === ProductReview::STATUS_PENDING) {
            try {
                app(NotificationDispatcher::class)->dispatch('review_pending', $tid, [
                    'vars' => [
                        'product_name' => (string) $product->name,
                        'customer_name' => (string) ($review->author_name ?? ''),
                    ],
                    'customer_user_id' => $user?->id ? (int) $user->id : null,
                    'admin_link' => '/dashboard/settings/shop/reviews',
                ]);
            } catch (\Throwable) {
            }
        }

        return response()->json(['data' => $review], 201);
    }

    public function adminIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $statusFilter = (string) $request->query('status', 'pending');
        $search = trim((string) $request->query('search', ''));
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));

        $counts = [];
        foreach (['all', ...ProductReview::STATUSES] as $tab) {
            $q = ProductReview::query()->where('tenant_id', $tid);
            if ($tab !== 'all') {
                $q->where('status', $tab);
            }
            $counts[$tab] = $q->count();
        }
        $counts['hold'] = $counts[ProductReview::STATUS_PENDING] ?? 0;

        $q = ProductReview::query()
            ->where('tenant_id', $tid)
            ->with(['product:id,name,slug', 'user:id,name,email'])
            ->orderByDesc('id');

        if ($statusFilter !== 'all') {
            $normalized = ProductReview::normalizeIncomingStatus($statusFilter);
            $q->where('status', $normalized);
        }

        if ($search !== '') {
            $q->where(function ($sub) use ($search) {
                $sub->where('body', 'like', '%'.$search.'%')
                    ->orWhere('author_name', 'like', '%'.$search.'%')
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', '%'.$search.'%'));
            });
        }

        $paginator = $q->paginate($perPage, ['*'], 'page', $page);
        $verifiedUserIds = $this->verifiedBuyerMap($tid, $paginator->getCollection());

        $items = $paginator->getCollection()->map(function (ProductReview $review) use ($tid, $verifiedUserIds) {
            $row = $this->mapAdminReview($review);
            $uid = (int) ($review->user_id ?? 0);
            $pid = (int) $review->product_id;
            $row['verified_buyer'] = $uid > 0 && ($verifiedUserIds[$uid.'_'.$pid] ?? false);

            return $row;
        })->values()->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'counts' => $counts,
            ],
        ]);
    }

    public function moderate(Request $request, ProductReview $review): \Illuminate\Http\JsonResponse
    {
        abort_unless((int) $review->tenant_id === (int) $request->user()->tenant_id, 404);
        $data = $request->validate([
            'status' => ['sometimes', 'string', Rule::in([
                'approved',
                'pending',
                'hold',
                'spam',
                'trash',
                'rejected',
            ])],
            'admin_reply' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'rating' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'body' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        if (array_key_exists('status', $data)) {
            $review->status = ProductReview::normalizeIncomingStatus($data['status']);
        }
        if (array_key_exists('admin_reply', $data)) {
            $review->admin_reply = $data['admin_reply'];
        }
        if (array_key_exists('rating', $data)) {
            $review->rating = (int) $data['rating'];
        }
        if (array_key_exists('body', $data)) {
            $review->body = $data['body'];
        }
        $review->save();

        return response()->json(['data' => $this->mapAdminReview($review->fresh(['product:id,name,slug', 'user:id,name,email']))]);
    }

    private function userPurchasedProduct(int $tid, int $userId, int $productId): bool
    {
        return OrderItem::query()
            ->where('product_id', $productId)
            ->whereHas('order', fn ($q) => $q->where('tenant_id', $tid)
                ->where('user_id', $userId)
                ->whereIn('status', \App\Services\Reports\OrderReports::salesStatuses()))
            ->exists();
    }

    /** @return array<string, bool> */
    private function verifiedBuyerMap(int $tid, \Illuminate\Support\Collection $reviews): array
    {
        $pairs = $reviews
            ->filter(fn (ProductReview $r) => $r->user_id && $r->product_id)
            ->map(fn (ProductReview $r) => [(int) $r->user_id, (int) $r->product_id])
            ->unique(fn ($pair) => $pair[0].'_'.$pair[1])
            ->values();

        if ($pairs->isEmpty()) {
            return [];
        }

        $map = [];
        foreach ($pairs as [$userId, $productId]) {
            $map[$userId.'_'.$productId] = $this->userPurchasedProduct($tid, $userId, $productId);
        }

        return $map;
    }

    /** @return array<string, mixed> */
    private function mapAdminReview(ProductReview $review): array
    {
        return [
            'id' => $review->id,
            'product_id' => $review->product_id,
            'user_id' => $review->user_id,
            'rating' => (int) $review->rating,
            'body' => $review->body,
            'admin_reply' => $review->admin_reply,
            'author_name' => $review->author_name ?: $review->user?->name,
            'status' => ProductReview::normalizeStoredStatus($review->status),
            'created_at' => optional($review->created_at)?->toIso8601String(),
            'product' => $review->product ? [
                'id' => $review->product->id,
                'name' => $review->product->name,
                'slug' => $review->product->slug,
            ] : null,
            'user' => $review->user ? [
                'id' => $review->user->id,
                'name' => $review->user->name,
                'email' => $review->user->email,
            ] : null,
        ];
    }
}
