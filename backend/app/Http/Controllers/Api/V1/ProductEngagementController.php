<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductPriceHistory;
use App\Models\ProductStockAlert;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductEngagementController extends Controller
{
    use ResolvesPublicTenant;

    public function priceHistory(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->storefront()->firstOrFail();
        $rows = ProductPriceHistory::query()
            ->where('tenant_id', $tid)
            ->where('product_id', $product->id)
            ->orderByDesc('recorded_at')
            ->limit(90)
            ->get(['price_minor', 'sale_price_minor', 'recorded_at']);

        return response()->json([
            'data' => [
                'price_updated_at' => $product->price_updated_at,
                'points' => $rows->map(fn ($r) => [
                    'price_minor' => (int) $r->price_minor,
                    'sale_price_minor' => $r->sale_price_minor ? (int) $r->sale_price_minor : null,
                    'recorded_at' => $r->recorded_at?->toIso8601String(),
                ])->values(),
            ],
        ]);
    }

    public function subscribeAlert(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'alert_type' => ['required', 'string', Rule::in([ProductStockAlert::TYPE_BACK_IN_STOCK, ProductStockAlert::TYPE_ON_SALE])],
            'channel' => ['required', 'string', Rule::in(['email', 'sms'])],
            'destination' => ['required', 'string', 'max:190'],
        ]);
        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->storefront()->firstOrFail();
        $user = $request->user('sanctum');
        $guest = trim((string) $request->header('X-Guest-Token', ''));

        ProductStockAlert::query()->updateOrCreate(
            [
                'tenant_id' => $tid,
                'product_id' => $product->id,
                'alert_type' => $data['alert_type'],
                'destination' => $data['destination'],
            ],
            [
                'user_id' => $user?->id,
                'guest_token' => $guest !== '' ? $guest : null,
                'channel' => $data['channel'],
                'notified_at' => null,
            ]
        );

        return response()->json(['data' => ['ok' => true]], 201);
    }
}
