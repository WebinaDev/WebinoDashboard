<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Services\Coupons\CouponService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Public storefront helpers used by the classic shop theme:
 * newsletter signup, guest order tracking, coupon preview and the category tree.
 */
class PublicStorefrontController extends Controller
{
    use ResolvesPublicTenant;

    public static function normalizeDigits(string $value): string
    {
        $map = [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ];

        return strtr($value, $map);
    }

    /** Last 10 digits of an Iranian mobile (09xx / +989xx / 9xx all match). */
    public static function phoneKey(?string $value): string
    {
        $digits = preg_replace('/\D+/', '', self::normalizeDigits((string) $value)) ?? '';

        return strlen($digits) >= 10 ? substr($digits, -10) : $digits;
    }

    public function subscribe(Request $request): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'email' => ['nullable', 'email:rfc', 'max:190', 'required_without:phone'],
            'phone' => ['nullable', 'string', 'max:32', 'required_without:email'],
            'source' => ['nullable', 'string', 'max:64'],
        ]);

        $email = isset($data['email']) ? mb_strtolower(trim((string) $data['email'])) : null;
        $phone = null;
        if (! empty($data['phone'])) {
            $key = self::phoneKey((string) $data['phone']);
            if (! preg_match('/^9\d{9}$/', $key)) {
                throw ValidationException::withMessages(['phone' => __('شماره موبایل معتبر نیست.')]);
            }
            $phone = '0'.$key;
        }

        $match = NewsletterSubscriber::query()->where('tenant_id', $tid)
            ->where(fn ($q) => $email ? $q->where('email', $email) : $q->where('phone', $phone))
            ->first();

        if ($match) {
            $match->forceFill(['status' => 'active'] + ($email && ! $match->email ? ['email' => $email] : []) + ($phone && ! $match->phone ? ['phone' => $phone] : []))->save();
        } else {
            NewsletterSubscriber::query()->create([
                'tenant_id' => $tid,
                'email' => $email,
                'phone' => $phone,
                'source' => $data['source'] ?? 'storefront',
                'status' => 'active',
                'ip_hash' => hash('sha256', (string) $request->ip().'|'.$tid),
            ]);
        }

        // Same response for new and existing subscribers so the endpoint cannot be used to probe lists.
        return response()->json(['data' => ['subscribed' => true]], 201);
    }

    public function adminSubscribers(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $q = trim((string) $request->query('q', ''));
        $page = NewsletterSubscriber::query()->where('tenant_id', $tid)
            ->when($q !== '', fn ($b) => $b->where(fn ($w) => $w->where('email', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%")))
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->query('per_page', 25))));

        return response()->json([
            'data' => collect($page->items())->map(fn (NewsletterSubscriber $s) => [
                'id' => $s->id,
                'email' => $s->email,
                'phone' => $s->phone,
                'source' => $s->source,
                'status' => $s->status,
                'created_at' => $s->created_at?->toIso8601String(),
            ])->values(),
            'meta' => ['total' => $page->total(), 'page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    public function adminDeleteSubscriber(Request $request, int $id): JsonResponse
    {
        NewsletterSubscriber::query()->where('tenant_id', $request->user()->tenant_id)->whereKey($id)->firstOrFail()->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function trackOrder(Request $request): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'number' => ['required', 'string', 'max:64'],
            'contact' => ['required', 'string', 'max:190'],
        ]);

        $number = trim(self::normalizeDigits((string) $data['number']));
        $number = ltrim($number, '#');
        $contact = trim(self::normalizeDigits((string) $data['contact']));

        $order = Order::query()->where('tenant_id', $tid)
            ->where(function ($q) use ($number) {
                $q->where('number', $number);
                if (ctype_digit($number)) {
                    $q->orWhere('id', (int) $number);
                }
            })
            ->first();

        $ok = false;
        if ($order) {
            if (str_contains($contact, '@')) {
                $ok = $order->customer_email !== null && hash_equals(mb_strtolower(trim($order->customer_email)), mb_strtolower($contact));
            } else {
                $key = self::phoneKey($contact);
                $ok = strlen($key) >= 10 && hash_equals(self::phoneKey($order->customer_phone), $key);
            }
        }

        if (! $ok) {
            return response()->json(['message' => __('سفارشی با این مشخصات پیدا نشد.')], 404);
        }

        $order->loadMissing('items');

        return response()->json([
            'data' => [
                'number' => $order->number ?: (string) $order->id,
                'status' => $order->status,
                'created_at' => $order->created_at?->toIso8601String(),
                'total_minor' => (int) $order->total_minor,
                'currency' => $order->currency,
                'items_count' => (int) $order->items->sum('quantity'),
                'tracking_code' => $order->trackingCode(),
                'tracking_url' => $order->trackingUrl(),
            ],
        ]);
    }

    public function previewCoupon(Request $request, CouponService $coupons): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
            'subtotal_minor' => ['required', 'integer', 'min:0'],
        ]);

        try {
            $result = $coupons->apply($tid, (string) $data['code'], (int) $data['subtotal_minor'], [], $request->user()?->id, 'site');
        } catch (ValidationException) {
            return response()->json(['message' => __('کد تخفیف معتبر نیست.'), 'errors' => ['code' => [__('کد تخفیف معتبر نیست.')]]], 422);
        }

        $coupon = $result['coupon'] ?? null;

        return response()->json([
            'data' => [
                'code' => is_object($coupon) ? $coupon->code : strtoupper(trim((string) $data['code'])),
                'discount_minor' => (int) $result['discount_minor'],
                'free_shipping' => (bool) $result['free_shipping'],
            ],
        ]);
    }

    /**
     * Cart "coupons you can use" chooser (parisma webino-coupon-chooser parity).
     * Only coupons the merchant opted in (restrictions.show_in_cart) or auto-apply ones are listed —
     * never private / password coupons.
     */
    public function availableCoupons(Request $request, CouponService $coupons): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'subtotal_minor' => ['required', 'integer', 'min:0'],
            'lines' => ['nullable', 'array', 'max:100'],
            'lines.*.product_id' => ['nullable', 'integer'],
            'lines.*.unit_price_minor' => ['required_with:lines', 'integer', 'min:0'],
            'lines.*.quantity' => ['required_with:lines', 'integer', 'min:1'],
        ]);
        $lines = array_values($data['lines'] ?? []);
        $userId = $request->user()?->id;

        $rows = Coupon::query()->where('tenant_id', $tid)->where('status', 'publish')
            ->where(fn ($q) => $q->whereNull('visibility')->orWhere('visibility', 'public'))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderBy('id')->limit(200)->get()
            ->filter(fn (Coupon $c) => $c->auto_apply || (bool) (($c->restrictions ?? [])['show_in_cart'] ?? false))
            ->take(20);

        $out = [];
        foreach ($rows as $c) {
            $eligible = true;
            $discount = 0;
            $free = false;
            $reason = null;
            try {
                $r = $coupons->evaluate($c, (int) $data['subtotal_minor'], $lines, $userId, 'site');
                $discount = (int) $r['discount_minor'];
                $free = (bool) $r['free_shipping'];
            } catch (ValidationException $e) {
                $eligible = false;
                $reason = collect($e->errors())->flatten()->first();
            }
            $out[] = [
                'code' => $c->code,
                'description' => (string) ($c->description ?? ''),
                'type' => $c->type,
                'amount' => (int) $c->amount,
                'min_spend_minor' => $c->min_spend_minor ? (int) $c->min_spend_minor : null,
                'expires_at' => $c->expires_at?->toIso8601String(),
                'eligible' => $eligible,
                'discount_minor' => $discount,
                'free_shipping' => $free,
                'reason' => $reason,
            ];
        }
        usort($out, fn ($a, $b) => [$b['eligible'], $b['discount_minor']] <=> [$a['eligible'], $a['discount_minor']]);

        return response()->json(['data' => $out]);
    }

    public function categoryTree(Request $request): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = Category::query()->where('tenant_id', $tid)
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', 'publish'))
            ->orderBy('sort_order')->orderBy('name')
            ->get(['id', 'parent_id', 'name', 'slug', 'icon_url', 'image_url', 'cover_image_url', 'sort_order']);

        $byParent = $rows->groupBy(fn (Category $c) => (int) ($c->parent_id ?? 0));
        $ids = $rows->pluck('id')->all();
        $build = function (int $parent, int $depth) use (&$build, $byParent, $ids): array {
            if ($depth > 6) {
                return [];
            }

            return ($byParent->get($parent) ?? collect())->map(fn (Category $c) => [
                'id' => $c->id,
                'parent_id' => $c->parent_id && in_array($c->parent_id, $ids, true) ? (int) $c->parent_id : null,
                'name' => $c->name,
                'slug' => $c->slug,
                'icon_url' => $c->icon_url,
                'image_url' => $c->image_url ?: $c->cover_image_url,
                'children' => $build((int) $c->id, $depth + 1),
            ])->values()->all();
        };

        // Orphans (parent missing / unpublished) become roots so nothing disappears.
        $roots = $build(0, 0);
        foreach ($byParent as $parent => $kids) {
            if ($parent !== 0 && ! in_array($parent, $ids, true)) {
                foreach ($kids as $c) {
                    $roots[] = ['id' => $c->id, 'parent_id' => null, 'name' => $c->name, 'slug' => $c->slug, 'icon_url' => $c->icon_url, 'image_url' => $c->image_url ?: $c->cover_image_url, 'children' => $build((int) $c->id, 1)];
                }
            }
        }

        return response()->json(['data' => ['tree' => $roots]])->header('Cache-Control', 'public, max-age=60');
    }
}
