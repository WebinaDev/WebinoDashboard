<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Services\Coupons\CouponService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CouponController extends Controller
{
    public function __construct(protected CouponService $coupons) {}

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
            'type' => [$partial ? 'sometimes' : 'required', 'string', 'in:percent,fixed_cart,fixed_product'],
            'amount' => [$partial ? 'sometimes' : 'required', 'integer', 'min:0'],
            'free_shipping' => ['nullable', 'boolean'],
            'individual_use' => ['nullable', 'boolean'],
            'exclude_sale' => ['nullable', 'boolean'],
            'min_spend_minor' => ['nullable', 'integer', 'min:0'],
            'max_spend_minor' => ['nullable', 'integer', 'min:0'],
            'usage_limit' => ['nullable', 'integer', 'min:0'],
            'usage_limit_per_user' => ['nullable', 'integer', 'min:0'],
            'expires_at' => ['nullable', 'date'],
            'status' => ['nullable', 'string', 'in:publish,draft,trash'],
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
