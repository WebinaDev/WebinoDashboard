<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\SupportTicket;
use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountPortalController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $tid = $user->tenant_id;
        $uid = $user->id;

        $ordersCount = Order::query()->where('tenant_id', $tid)->where('user_id', $uid)->count();
        $ticketsOpen = SupportTicket::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $uid)
            ->whereIn('status', ['open', 'answered', 'pending'])
            ->count();
        $notificationsUnread = UserNotification::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $uid)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'data' => [
                'orders_count' => $ordersCount,
                'tickets_open_count' => $ticketsOpen,
                'notifications_unread' => $notificationsUnread,
            ],
        ]);
    }

    public function ordersIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = Order::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->with(['items.product:id,name,slug']);

        if ($request->filled('status')) {
            $q->where('status', $request->query('status'));
        }

        $perPage = min(50, max(1, (int) $request->query('per_page', 15)));
        $paginator = $q->orderByDesc('id')->paginate($perPage);

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

    public function ordersShow(Request $request, int $order): JsonResponse
    {
        $row = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('user_id', $request->user()->id)
            ->whereKey($order)
            ->with(['items.product', 'items.variant', 'returns'])
            ->firstOrFail();

        return response()->json(['data' => $row]);
    }

    public function addressesShow(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => ['addresses' => $user->addresses ?? []]]);
    }

    public function addressesUpdate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'addresses' => ['required', 'array'],
            'addresses.*.label' => ['nullable', 'string', 'max:64'],
            'addresses.*.name' => ['nullable', 'string', 'max:255'],
            'addresses.*.phone' => ['nullable', 'string', 'max:32'],
            'addresses.*.address' => ['nullable', 'string', 'max:500'],
            'addresses.*.city' => ['nullable', 'string', 'max:120'],
            'addresses.*.postcode' => ['nullable', 'string', 'max:20'],
            'addresses.*.is_default' => ['nullable', 'boolean'],
        ]);
        $user = $request->user();
        $user->update(['addresses' => $data['addresses']]);

        return response()->json(['data' => ['addresses' => $user->fresh()->addresses ?? []]]);
    }

    public function favoritesIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $ids = array_values(array_unique(array_map('intval', $user->wishlist ?? [])));
        $products = $ids === []
            ? collect()
            : Product::query()
                ->where('tenant_id', $user->tenant_id)
                ->whereIn('id', $ids)
                ->get(['id', 'name', 'slug', 'sku', 'price_minor', 'sale_price_minor', 'currency']);

        return response()->json([
            'data' => [
                'product_ids' => $ids,
                'products' => $products,
            ],
        ]);
    }

    public function favoritesAdd(Request $request, int $productId): JsonResponse
    {
        $user = $request->user();
        Product::query()
            ->where('tenant_id', $user->tenant_id)
            ->whereKey($productId)
            ->firstOrFail();

        $list = array_values(array_unique(array_merge(array_map('intval', $user->wishlist ?? []), [$productId])));
        $user->update(['wishlist' => $list]);

        return response()->json(['data' => ['product_ids' => $list]], 201);
    }

    public function favoritesRemove(Request $request, int $productId): JsonResponse
    {
        $user = $request->user();
        $list = array_values(array_filter(
            array_map('intval', $user->wishlist ?? []),
            fn (int $id) => $id !== $productId
        ));
        $user->update(['wishlist' => $list]);

        return response()->json(['data' => ['product_ids' => $list]]);
    }

    public function reviewsIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $items = ProductReview::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->with('product:id,name,slug')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $items]);
    }

    public function profileShow(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => $user->only(['id', 'name', 'email', 'phone']),
        ]);
    }

    public function profileUpdate(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'email' => [
                'sometimes',
                'email',
                'max:255',
                Rule::unique('users', 'email')->where('tenant_id', $user->tenant_id)->ignore($user->id),
            ],
        ]);
        $user->update($data);

        return response()->json(['data' => $user->fresh()->only(['id', 'name', 'email', 'phone'])]);
    }

    public function wallet(Request $request): JsonResponse
    {
        $user = $request->user();
        $currency = $user->tenant?->default_currency ?? 'IRT';

        return response()->json([
            'data' => [
                'balance_minor' => (int) ($user->wallet_balance_minor ?? 0),
                'currency' => $currency,
            ],
        ]);
    }
}
