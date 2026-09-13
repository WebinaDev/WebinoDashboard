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
        $stats = [
            'total' => (clone $q)->count(),
            'publish' => (clone $q)->where('status', 'publish')->count(),
            'draft' => (clone $q)->where('status', 'draft')->count(),
        ];
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
            ],
        ]);
    }

    /** @return array<string, mixed> */
    protected function validateCoupon(Request $request, int $tid, bool $partial): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
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
        ]);
    }
}
