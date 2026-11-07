<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Poetry\PoetryMedia;
use App\Services\Membership\MembershipService;
use App\Services\Poetry\PoetryPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MembershipController extends Controller
{
    public function __construct(private MembershipService $membership) {}

    /** Public: plans + benefits + caller entitlement (if authenticated). */
    public function show(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->attributes->get('public_tenant_id') ?: $request->user()?->tenant_id ?: 0);
        abort_if($tenantId <= 0, 404);
        $settings = $this->membership->settingsFor($tenantId);
        $user = $request->user();
        $active = $this->membership->isActive($user);

        return response()->json([
            'data' => [
                'enabled' => (bool) ($settings['enabled'] ?? true),
                'title' => $settings['title'] ?? 'حساب کاربری ویژه',
                'benefits' => $settings['benefits'] ?? [],
                'free_audio_downloads' => $this->membership->freeAudioDownloadLimit($tenantId),
                'product_discount_percent' => $this->membership->productDiscountPercent($tenantId),
                'plans' => collect($settings['plans'] ?? [])->filter(fn ($p) => ($p['enabled'] ?? true))->values()->all(),
                'is_member' => $active,
                'ends_at' => $this->membership->activeUntil($user)?->toIso8601String(),
                'audio_downloads_used' => $user
                    ? $this->membership->audioDownloadsUsed($user)
                    : 0,
                'audio_downloads_remaining' => $user
                    ? $this->membership->audioDownloadsRemaining($user)
                    : $this->membership->freeAudioDownloadLimit($tenantId),
            ],
        ]);
    }

    /** Authenticated: start checkout for a membership plan (virtual line). */
    public function purchase(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }
        $tenantId = (int) $user->tenant_id;
        if (! $this->membership->isEnabled($tenantId)) {
            throw ValidationException::withMessages(['plan_id' => 'اشتراک ویژه در این سایت فعال نیست.']);
        }
        $data = $request->validate([
            'plan_id' => ['required', 'string', 'max:32'],
        ]);
        $plan = $this->membership->plan($tenantId, $data['plan_id']);
        if (! $plan || ! ($plan['enabled'] ?? true)) {
            throw ValidationException::withMessages(['plan_id' => 'طرح نامعتبر است.']);
        }
        $product = $this->membership->ensurePlanProduct($tenantId, $plan);
        $price = (int) ($plan['price_minor'] ?? 0);
        $months = max(1, (int) ($plan['months'] ?? 1));

        $order = DB::transaction(function () use ($user, $tenantId, $product, $price, $plan, $months) {
            $order = Order::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $user->id,
                'status' => 'pending_payment',
                'subtotal_minor' => $price,
                'discount_minor' => 0,
                'shipping_minor' => 0,
                'tax_minor' => 0,
                'total_minor' => $price,
                'currency' => $product->currency ?: 'IRR',
                'meta' => [
                    'membership_plan_id' => $plan['id'],
                    'membership_months' => $months,
                    'kind' => 'membership',
                ],
            ]);
            OrderItem::query()->create([
                'order_id' => $order->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'quantity' => 1,
                'unit_price_minor' => $price,
                'meta' => [
                    'membership_plan_id' => $plan['id'],
                    'membership_months' => $months,
                ],
            ]);

            return $order;
        });

        return response()->json([
            'data' => [
                'order_id' => $order->id,
                'total_minor' => $order->total_minor,
                'currency' => $order->currency,
                'plan_id' => $plan['id'],
                'status' => $order->status,
            ],
        ], 201);
    }

    /** Admin: manually grant / extend membership for a user. */
    public function grant(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'user_id' => ['required', 'integer'],
            'plan_id' => ['required', 'string', 'max:32'],
            'months' => ['nullable', 'integer', 'min:1', 'max:36'],
        ]);
        $user = \App\Models\User::query()
            ->where('tenant_id', $actor->tenant_id)
            ->whereKey($data['user_id'])
            ->firstOrFail();
        $plan = $this->membership->plan((int) $actor->tenant_id, $data['plan_id']);
        $months = (int) ($data['months'] ?? ($plan['months'] ?? 1));
        $row = $this->membership->grant($user, $data['plan_id'], $months, [
            'granted_by' => $actor->id,
            'source' => 'admin',
        ]);

        return response()->json(['data' => $row]);
    }

    /** Record / authorize an audio (or video) download against free quota. */
    public function downloadMedia(Request $request, int $media): JsonResponse
    {
        $tenantId = (int) ($request->attributes->get('public_tenant_id') ?: $request->user()?->tenant_id ?: 0);
        abort_if($tenantId <= 0, 404);
        $item = PoetryMedia::query()->published()->playable()->whereKey($media)->firstOrFail();
        $user = $request->user();
        $guestKey = substr(hash('sha256', (string) $request->ip().'|'.(string) $request->userAgent()), 0, 64);

        if (! $this->membership->canDownloadMedia($user, $tenantId, $guestKey)) {
            return response()->json([
                'message' => 'سقف دانلود رایگان تمام شده است. برای دانلود نامحدود اشتراک ویژه تهیه کنید.',
                'code' => 'membership_required',
                'data' => [
                    'free_audio_downloads' => $this->membership->freeAudioDownloadLimit($tenantId),
                    'used' => $this->membership->audioDownloadsUsed($user, $tenantId, $guestKey),
                ],
            ], 403);
        }

        $this->membership->recordDownload($tenantId, $user?->id, $guestKey, (int) $item->id, (string) ($item->kind ?? 'audio'));
        $item->loadMissing('asset');
        $row = PoetryPresenter::media($item);

        return response()->json(['data' => array_intersect_key($row, array_flip(['id', 'title', 'kind', 'url', 'external_url', 'embed_url']))]);
    }

    /** Called from OrderStatusService when an order becomes paid. */
    public static function grantFromPaidOrder(Order $order): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $planId = $meta['membership_plan_id'] ?? null;
        $months = (int) ($meta['membership_months'] ?? 0);
        if (! $planId || $months < 1 || ! $order->user_id) {
            return;
        }
        $user = $order->user;
        if (! $user) {
            return;
        }
        app(MembershipService::class)->grant($user, (string) $planId, $months, [
            'order_id' => $order->id,
            'source' => 'checkout',
        ]);
    }
}
