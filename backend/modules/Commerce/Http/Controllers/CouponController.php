<?php

namespace Modules\Commerce\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Services\Coupons\CouponService;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CouponController extends Controller
{
    public const STOREFRONT_KEY = 'coupon_storefront';

    /** @return array{single_coupon: bool, cart_chooser: bool, progress_widget: bool, auto_apply: bool} */
    public static function storefrontDefaults(): array
    {
        return [
            'single_coupon' => true,
            'cart_chooser' => true,
            'progress_widget' => true,
            'auto_apply' => true,
        ];
    }

    public function __construct(
        protected CouponService $coupons,
        protected ModuleSettingsService $moduleSettings,
    ) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = Coupon::query()->where('tenant_id', $tid)->where('status', '!=', 'trash');
        if ($search = $request->query('search')) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('code', 'like', $like)->orWhere('description', 'like', $like);
            });
        }
        if (in_array($channel = (string) $request->query('channel', ''), ['site', 'bale', 'telegram'], true)) {
            $q->whereJsonContains('restrictions->channels', $channel);
        }
        $stats = [
            'total' => (clone $q)->count(),
            'publish' => (clone $q)->where('status', 'publish')->count(),
            'draft' => (clone $q)->where('status', 'draft')->count(),
            'expired' => (clone $q)->whereNotNull('expires_at')->where('expires_at', '<', now())->count(),
        ];
        $expired = $request->query('expired');
        if ($expired === '1' || $expired === 'true') {
            $q->whereNotNull('expires_at')->where('expires_at', '<', now());
        } elseif ($expired === '0' || $expired === 'false') {
            $q->where(function ($w) {
                $w->whereNull('expires_at')->orWhere('expires_at', '>=', now());
            });
        }
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $paginator = $q->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'stats' => $stats,
            ],
        ]);
    }

    public function offerTemplates(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $ownedIds = Coupon::query()->where('tenant_id', $tid)->where('status', '!=', 'trash')->get(['id', 'restrictions'])
            ->mapWithKeys(fn ($c) => [($c->restrictions['offer_template'] ?? '') => $c->id])->filter();
        $owned = [];
        foreach (\App\Services\Coupons\OfferTemplates::all() as $t) {
            $owned[$t['id']] = isset($ownedIds[$t['id']]);
        }
        $rows = array_map(fn ($t) => $t + ['coupon_id' => $ownedIds[$t['id']] ?? null], \App\Services\Coupons\OfferTemplates::all());

        return response()->json([
            'data' => $rows,
            'items' => $rows,
            'owned' => $owned,
        ]);
    }

    public function fromTemplate(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['template_id' => ['required', 'string', 'max:64']]);
        $tid = (int) $request->user()->tenant_id;
        $already = Coupon::query()->where('tenant_id', $tid)->where('status', '!=', 'trash')
            ->whereJsonContains('restrictions->offer_template', $data['template_id'])
            ->exists();
        $coupon = \App\Services\Coupons\OfferTemplates::createFor($tid, $data['template_id']);
        abort_if(! $coupon, 404);

        return response()->json(['data' => $coupon, 'already' => $already, 'coupon' => $coupon], $already ? 200 : 201);
    }

    /** Offer / coupon-builder coupons (auto-apply, conditioned, or tagged is_offer). */
    public function offers(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = Coupon::query()
            ->where('tenant_id', $tid)
            ->where('status', '!=', 'trash')
            ->orderByDesc('id')
            ->get()
            ->filter(function (Coupon $c) {
                $r = is_array($c->restrictions) ? $c->restrictions : [];

                return (bool) $c->auto_apply
                    || (! empty($c->condition_type) && $c->condition_type !== 'none')
                    || ! empty($r['is_offer'])
                    || ! empty($r['offer_template']);
            })
            ->map(function (Coupon $c) {
                $tpl = is_string($c->restrictions['offer_template'] ?? null) ? $c->restrictions['offer_template'] : null;
                $title = $c->description ?: $c->code;
                $condition = $c->condition_type && $c->condition_type !== 'none'
                    ? trim(($c->condition_type).' '.($c->condition_value ?? ''))
                    : $c->code;
                if ($tpl) {
                    $found = \App\Services\Coupons\OfferTemplates::find($tpl);
                    if ($found) {
                        $title = $found['title'];
                        $condition = $found['condition_label'];
                    }
                }

                return [
                    'id' => $c->id,
                    'code' => $c->code,
                    'type' => $c->type,
                    'amount' => (string) $c->amount,
                    'title' => $title,
                    'condition_label' => $condition,
                    'description' => $c->description,
                    'free_shipping' => (bool) $c->free_shipping,
                    'max_discount' => $c->max_discount_minor,
                    'shipping_percent' => $c->shipping_percent,
                    'template_id' => $tpl,
                    'auto_apply' => (bool) $c->auto_apply,
                ];
            })
            ->values();

        return response()->json(['data' => ['items' => $items], 'items' => $items]);
    }

    public function storefrontSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $settings = $this->moduleSettings->get(
            (int) $request->user()->tenant_id,
            'marketing',
            self::STOREFRONT_KEY,
            self::storefrontDefaults()
        );

        return response()->json(['data' => array_merge(self::storefrontDefaults(), $settings)]);
    }

    public function updateStorefrontSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'single_coupon' => ['sometimes', 'boolean'],
            'cart_chooser' => ['sometimes', 'boolean'],
            'progress_widget' => ['sometimes', 'boolean'],
            'auto_apply' => ['sometimes', 'boolean'],
        ]);
        $current = $this->moduleSettings->get(
            (int) $request->user()->tenant_id,
            'marketing',
            self::STOREFRONT_KEY,
            self::storefrontDefaults()
        );
        $merged = array_merge(self::storefrontDefaults(), $current, $data);
        $saved = $this->moduleSettings->put(
            (int) $request->user()->tenant_id,
            'marketing',
            self::STOREFRONT_KEY,
            $merged
        );

        return response()->json(['data' => array_merge(self::storefrontDefaults(), $saved)]);
    }

    public function show(Request $request, Coupon $coupon): \Illuminate\Http\JsonResponse
    {
        abort_if($coupon->tenant_id !== $request->user()->tenant_id, 403);

        return response()->json(['data' => $coupon]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $this->validateCoupon($request, $tid, false);
        $data['code'] = strtoupper($data['code']);
        $data['tenant_id'] = $tid;
        $coupon = Coupon::query()->create($data);

        return response()->json(['data' => $coupon], 201);
    }

    public function update(Request $request, Coupon $coupon): \Illuminate\Http\JsonResponse
    {
        abort_if($coupon->tenant_id !== $request->user()->tenant_id, 403);
        $data = $this->validateCoupon($request, $coupon->tenant_id, true);
        if (isset($data['code'])) {
            $data['code'] = strtoupper($data['code']);
        }
        $coupon->update($data);

        return response()->json(['data' => $coupon->fresh()]);
    }

    public function destroy(Request $request, Coupon $coupon): \Illuminate\Http\JsonResponse
    {
        abort_if($coupon->tenant_id !== $request->user()->tenant_id, 403);
        $coupon->update(['status' => 'trash']);
        $coupon->delete();

        return response()->json([], 204);
    }

    public function bulk(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', 'in:trash'],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);
        $tid = $request->user()->tenant_id;
        $q = Coupon::query()->where('tenant_id', $tid)->whereIn('id', $data['ids']);
        $q->update(['status' => 'trash']);
        Coupon::query()->where('tenant_id', $tid)->whereIn('id', $data['ids'])->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function generateCode(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'data' => ['code' => $this->coupons->generateCode($request->user()->tenant_id)],
        ]);
    }

    public function preview(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
            'subtotal_minor' => ['required', 'integer', 'min:0'],
            'channel' => ['nullable', 'string'],
            'lines' => ['nullable', 'array'],
        ]);
        $result = $this->coupons->apply(
            $request->user()->tenant_id,
            $data['code'],
            (int) $data['subtotal_minor'],
            $data['lines'] ?? [],
            $request->user()->id,
            $data['channel'] ?? 'site'
        );

        return response()->json([
            'data' => [
                'discount_minor' => $result['discount_minor'],
                'coupon' => $result['coupon'],
                'free_shipping' => $result['free_shipping'],
                'shipping_percent' => $result['shipping_percent'],
                'individual_use' => $result['individual_use'],
            ],
        ]);
    }

    /** @return array<string, mixed> */
    protected function validateCoupon(Request $request, int $tid, bool $partial): array
    {
        $req = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'code' => [$req, 'string', 'max:64', Rule::unique('coupons', 'code')->where('tenant_id', $tid)->ignore($request->route('coupon'))],
            'type' => [$partial ? 'sometimes' : 'required', 'string', 'in:percent,fixed_cart,fixed_product,bogo,bundle,tiered'],
            'amount' => [$partial ? 'sometimes' : 'required', 'integer', 'min:0'],
            'free_shipping' => ['nullable', 'boolean'],
            'individual_use' => ['nullable', 'boolean'],
            'exclude_sale' => ['nullable', 'boolean'],
            'min_spend_minor' => ['nullable', 'integer', 'min:0'],
            'max_spend_minor' => ['nullable', 'integer', 'min:0'],
            'usage_limit' => ['nullable', 'integer', 'min:0'],
            'usage_limit_per_user' => ['nullable', 'integer', 'min:0'],
            'expires_at' => ['nullable', 'date'],
            'status' => ['nullable', 'string', 'in:publish,draft,pending,private,future,trash'],
            'visibility' => ['nullable', 'string', 'in:public,private,password'],
            'password' => ['nullable', 'string', 'max:191'],
            'scheduled_at' => ['nullable', 'date'],
            'description' => ['nullable', 'string'],
            'restrictions' => ['nullable', 'array'],
            'restrictions.product_ids' => ['nullable', 'array'],
            'restrictions.product_ids.*' => ['integer'],
            'restrictions.category_ids' => ['nullable', 'array'],
            'restrictions.category_ids.*' => ['integer'],
            'restrictions.brand_ids' => ['nullable', 'array'],
            'restrictions.brand_ids.*' => ['integer'],
            'restrictions.user_ids' => ['nullable', 'array'],
            'restrictions.user_ids.*' => ['integer'],
            'restrictions.emails' => ['nullable', 'array'],
            'restrictions.emails.*' => ['string', 'max:191'],
            'restrictions.channels' => ['nullable', 'array'],
            'restrictions.channels.*' => ['string', 'in:site,bale,telegram'],
            'restrictions.show_in_cart' => ['nullable', 'boolean'],
            'restrictions.offer' => ['nullable', 'array'],
            'restrictions.offer.buy' => ['nullable', 'integer', 'min:1', 'max:100'],
            'restrictions.offer.get' => ['nullable', 'integer', 'min:1', 'max:100'],
            'restrictions.offer.get_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'restrictions.offer.bundle_price_minor' => ['nullable', 'integer', 'min:0'],
            'restrictions.offer.tiers' => ['nullable', 'array', 'max:10'],
            'restrictions.offer.tiers.*.min_qty' => ['required', 'integer', 'min:1'],
            'restrictions.offer.tiers.*.percent' => ['required', 'integer', 'min:1', 'max:100'],
            'condition_type' => ['nullable', 'string', Rule::in(Coupon::CONDITION_TYPES)],
            'condition_value' => ['nullable', 'integer', 'min:0', 'required_if:condition_type,order_nth,min_amount,min_items'],
            'auto_apply' => ['nullable', 'boolean'],
            'max_discount_minor' => ['nullable', 'integer', 'min:0'],
            'shipping_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);

        if (array_key_exists('condition_type', $data) && $data['condition_type'] === null) {
            $data['condition_type'] = 'none';
        }
        if (($data['condition_type'] ?? null) === 'none') {
            $data['condition_value'] = null;
        }
        if (array_key_exists('auto_apply', $data) && $data['auto_apply'] === null) {
            $data['auto_apply'] = false;
        }

        return $data;
    }
}
