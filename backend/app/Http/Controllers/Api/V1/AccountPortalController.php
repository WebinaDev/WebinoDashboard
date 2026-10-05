<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\SupportTicket;
use App\Models\UserNotification;
use App\Models\WalletLedger;
use App\Models\WalletWithdrawal;
use App\Services\Wallet\WalletService;
use App\Support\PortalAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountPortalController extends Controller
{
    public function __construct(protected WalletService $wallet) {}

    public function overview(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
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
        $wishlistCount = count(array_unique(array_map('intval', $user->wishlist ?? [])));
        $walletSettings = $this->wallet->settings($tid);

        $recentOrders = Order::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $uid)
            ->orderByDesc('id')
            ->limit(5)
            ->get(['id', 'number', 'status', 'total_minor', 'currency', 'created_at']);

        return response()->json([
            'data' => [
                'orders_count' => $ordersCount,
                'tickets_open_count' => $ticketsOpen,
                'notifications_unread' => $notificationsUnread,
                'wishlist_count' => $wishlistCount,
                'wallet_balance_minor' => (int) ($user->wallet_balance_minor ?? 0),
                'wallet_enabled' => ! empty($walletSettings['enabled']),
                'currency' => $user->tenant?->default_currency ?? 'IRT',
                'recent_orders' => $recentOrders,
                'order_groups' => [
                    ['key' => 'orders', 'href' => '/dashboard/account/orders', 'count' => $ordersCount],
                    ['key' => 'tickets', 'href' => '/dashboard/account/tickets', 'count' => $ticketsOpen],
                    ['key' => 'favorites', 'href' => '/dashboard/account/favorites', 'count' => $wishlistCount],
                ],
            ],
        ]);
    }

    public function ordersIndex(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
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
        $user = PortalAccess::authorize($request);
        $row = Order::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->whereKey($order)
            ->with(['items.product', 'items.variant', 'returns'])
            ->firstOrFail();

        return response()->json(['data' => $row]);
    }

    public function addressesShow(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);

        return response()->json(['data' => ['addresses' => $user->addresses ?? []]]);
    }

    public function addressesUpdate(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $data = $request->validate([
            'addresses' => ['required', 'array', 'max:10'],
            'addresses.*.label' => ['nullable', 'string', 'max:64'],
            'addresses.*.name' => ['nullable', 'string', 'max:255'],
            'addresses.*.phone' => ['nullable', 'string', 'max:32'],
            'addresses.*.address' => ['nullable', 'string', 'max:500'],
            'addresses.*.city' => ['nullable', 'string', 'max:120'],
            'addresses.*.province_code' => ['nullable', 'string', 'max:16'],
            'addresses.*.plaque' => ['nullable', 'string', 'max:32'],
            'addresses.*.unit' => ['nullable', 'string', 'max:32'],
            'addresses.*.postcode' => ['nullable', 'string', 'max:20'],
            'addresses.*.lat' => ['nullable', 'numeric'],
            'addresses.*.lng' => ['nullable', 'numeric'],
            'addresses.*.is_default' => ['nullable', 'boolean'],
        ]);
        $user->update(['addresses' => $data['addresses']]);

        return response()->json(['data' => ['addresses' => $user->fresh()->addresses ?? []]]);
    }

    public function favoritesIndex(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $ids = array_values(array_unique(array_map('intval', $user->wishlist ?? [])));
        $products = $ids === []
            ? collect()
            : Product::query()
                ->where('tenant_id', $user->tenant_id)
                ->whereIn('id', $ids)
                ->get(['id', 'name', 'slug', 'sku', 'price_minor', 'sale_price_minor', 'sale_starts_at', 'sale_ends_at', 'currency'])
                ->map(fn (Product $p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'slug' => $p->slug,
                    'sku' => $p->sku,
                    'price_minor' => $p->price_minor,
                    'sale_price_minor' => $p->effectiveSalePriceMinor(),
                    'currency' => $p->currency,
                ])
                ->values();

        return response()->json([
            'data' => [
                'product_ids' => $ids,
                'products' => $products,
            ],
        ]);
    }

    public function favoritesAdd(Request $request, int $productId): JsonResponse
    {
        $user = PortalAccess::authorize($request);
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
        $user = PortalAccess::authorize($request);
        $list = array_values(array_filter(
            array_map('intval', $user->wishlist ?? []),
            fn (int $id) => $id !== $productId
        ));
        $user->update(['wishlist' => $list]);

        return response()->json(['data' => ['product_ids' => $list]]);
    }

    public function reviewsIndex(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $tab = (string) $request->query('tab', 'mine');

        if ($tab === 'pending') {
            return response()->json(['data' => $this->pendingReviewProducts($user)]);
        }
        if ($tab === 'questions') {
            return response()->json(['data' => app(ProductQuestionController::class)->forUser((int) $user->tenant_id, (int) $user->id)]);
        }

        $items = ProductReview::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->with('product:id,name,slug')
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(fn (ProductReview $r) => [
                'id' => $r->id,
                'rating' => (int) $r->rating,
                'body' => $r->body,
                'status' => ProductReview::normalizeStoredStatus($r->status),
                'admin_reply' => $r->admin_reply,
                'product' => $r->product ? $r->product->only(['id', 'name', 'slug']) : null,
                'created_at' => optional($r->created_at)?->toIso8601String(),
            ])
            ->all();

        return response()->json(['data' => $items]);
    }

    public function profileShow(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);

        return response()->json([
            'data' => $user->only(['id', 'name', 'email', 'phone', 'bank_sheba', 'bank_name', 'bank_account', 'bank_card', 'national_id', 'kyc_status']),
        ]);
    }

    public function profileUpdate(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'bank_sheba' => ['sometimes', 'nullable', 'string', 'max:34'],
            'bank_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'bank_account' => ['sometimes', 'nullable', 'string', 'max:64'],
            'bank_card' => ['sometimes', 'nullable', 'string', 'max:24'],
            'national_id' => ['sometimes', 'nullable', 'string', 'max:20'],
            'kyc_status' => ['sometimes', 'nullable', 'string', 'in:pending,verified,rejected'],
            'email' => [
                'sometimes',
                'email',
                'max:255',
                Rule::unique('users', 'email')->where('tenant_id', $user->tenant_id)->ignore($user->id),
            ],
        ]);
        $user->update($data);

        if (($data['kyc_status'] ?? null) === 'verified' && ! $user->kyc_verified_at) {
            $user->kyc_verified_at = now();
            $user->save();
        }

        return response()->json(['data' => $user->fresh()->only(['id', 'name', 'email', 'phone', 'bank_sheba', 'bank_name', 'bank_account', 'bank_card', 'national_id', 'kyc_status'])]);
    }

    public function wallet(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $settings = $this->wallet->settings($user->tenant_id);
        $currency = $user->tenant?->default_currency ?? 'IRT';

        return response()->json([
            'data' => [
                'balance_minor' => (int) ($user->wallet_balance_minor ?? 0),
                'currency' => $currency,
                'enabled' => ! empty($settings['enabled']),
                'min_topup_minor' => (int) ($settings['min_topup_minor'] ?? 0),
                'min_withdraw_minor' => (int) ($settings['min_withdraw_minor'] ?? 0),
                'bank_sheba' => $user->bank_sheba,
            ],
        ]);
    }

    public function walletLedger(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $items = WalletLedger::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json(['data' => ['items' => $items]]);
    }

    public function walletTopup(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $settings = $this->wallet->settings($user->tenant_id);
        abort_unless(! empty($settings['enabled']), 422, 'Wallet disabled');
        $data = $request->validate([
            'amount_minor' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $min = (int) ($settings['min_topup_minor'] ?? 0);
        if ($data['amount_minor'] < max(1, $min)) {
            return response()->json(['message' => 'Below minimum topup'], 422);
        }

        return response()->json([
            'message' => 'Wallet topup requires a completed payment.',
        ], 422);
    }

    public function walletWithdraw(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $settings = $this->wallet->settings($user->tenant_id);
        abort_unless(! empty($settings['enabled']), 422, 'Wallet disabled');
        $data = $request->validate([
            'amount_minor' => ['required', 'integer', 'min:1'],
            'sheba' => ['nullable', 'string', 'max:34'],
        ]);
        $wd = $this->wallet->requestWithdraw(
            $user,
            (int) $user->tenant_id,
            (int) $data['amount_minor'],
            $data['sheba'] ?? null
        );

        return response()->json(['data' => $wd], 201);
    }

    public function walletWithdrawals(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $items = WalletWithdrawal::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->limit(20)
            ->get();

        return response()->json(['data' => ['items' => $items]]);
    }

    public function preferencesShow(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);

        return response()->json(['data' => $this->normalizePreferences($user->ui_preferences)]);
    }

    public function preferencesUpdate(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $data = $request->validate([
            'locale' => ['sometimes', 'string', Rule::in(['fa', 'en'])],
            'theme' => ['sometimes', 'string', Rule::in(['light', 'dark', 'system'])],
            'accent' => ['sometimes', 'string', 'max:64'],
        ]);

        $prefs = array_merge($this->normalizePreferences($user->ui_preferences), $data);
        $user->update(['ui_preferences' => $prefs]);

        return response()->json(['data' => $prefs]);
    }

    /** @return list<array<string, mixed>> */
    private function pendingReviewProducts(\App\Models\User $user): array
    {
        $tid = (int) $user->tenant_id;
        $reviewedProductIds = ProductReview::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $user->id)
            ->pluck('product_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $productIds = OrderItem::query()
            ->whereHas('order', fn ($q) => $q->where('tenant_id', $tid)
                ->where('user_id', $user->id)
                ->whereIn('status', \App\Services\Reports\OrderReports::salesStatuses()))
            ->when($reviewedProductIds !== [], fn ($q) => $q->whereNotIn('product_id', $reviewedProductIds))
            ->distinct()
            ->pluck('product_id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($productIds === []) {
            return [];
        }

        return Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('id', $productIds)
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'name', 'slug'])
            ->map(fn (Product $p) => $p->only(['id', 'name', 'slug']))
            ->all();
    }

    /** @param  array<string, mixed>|null  $raw */
    private function normalizePreferences(?array $raw): array
    {
        $raw = is_array($raw) ? $raw : [];

        return [
            'locale' => in_array($raw['locale'] ?? null, ['fa', 'en'], true) ? $raw['locale'] : null,
            'theme' => in_array($raw['theme'] ?? null, ['light', 'dark', 'system'], true) ? $raw['theme'] : null,
            'accent' => isset($raw['accent']) && is_string($raw['accent']) ? $raw['accent'] : null,
        ];
    }
}
