<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Services\Shop\ProductCompareService;
use Illuminate\Http\Request;

class ProductCompareController extends Controller
{
    use ResolvesPublicTenant;

    public function __construct(protected ProductCompareService $compare) {}

    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $session = $this->compare->resolveSession($tid, $request);
        $search = trim((string) $request->query('q', ''));
        $items = $this->compare->products($tid, $this->compare->ids($session), $search !== '' ? $search : null);

        return response()->json([
            'data' => [
                'product_ids' => $this->compare->ids($session),
                'items' => $items,
                'max' => ProductCompareService::MAX_ITEMS,
                'guest_token' => $session->guest_token,
            ],
        ]);
    }

    public function add(Request $request, int $productId): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $result = $this->compare->add($tid, $request, $productId);

        return response()->json([
            'data' => [
                'product_ids' => $result['ids'],
                'guest_token' => $result['guest_token'],
            ],
        ])->cookie('compare_token', (string) ($result['guest_token'] ?? ''), 60 * 24 * 90, '/', null, false, false, false, 'Lax');
    }

    public function remove(Request $request, int $productId): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $result = $this->compare->remove($tid, $request, $productId);

        return response()->json([
            'data' => [
                'product_ids' => $result['ids'],
                'guest_token' => $result['guest_token'],
            ],
        ]);
    }
}
