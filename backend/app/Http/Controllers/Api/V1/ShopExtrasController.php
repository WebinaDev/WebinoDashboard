<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyReward;
use App\Services\Shop\LoyaltyService;
use App\Services\Shop\MapsService;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class ShopExtrasController extends Controller
{
    public function mapsSearch(Request $request, MapsService $maps): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'max:200']]);
        $tid = (int) $request->user()->tenant_id;
        $results = $maps->search($tid, $data['q']);
        if ($results === []) {
            // Fallback: store address as single suggestion when no key / empty results.
            $addr = ShopSettings::defaultCustomerAddress($tid);

            return response()->json(['data' => [[
                'title' => 'Store address',
                'address' => trim(($addr['address_1'] ?? '').' '.($addr['city'] ?? '')),
                'lat' => null,
                'lng' => null,
                'source' => 'store_address',
            ]]]);
        }

        return response()->json(['data' => $results]);
    }

    public function defaultAddress(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'data' => ShopSettings::defaultCustomerAddress((int) $request->user()->tenant_id),
        ]);
    }

    public function loyaltyRewards(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = LoyaltyReward::query()->where('tenant_id', $tid)->orderBy('sort_order')->orderBy('id')->get();

        return response()->json(['data' => $rows]);
    }

    public function saveLoyaltyRewards(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'rewards' => ['required', 'array'],
            'rewards.*.id' => ['nullable', 'integer'],
            'rewards.*.uid' => ['nullable', 'string', 'max:64'],
            'rewards.*.title' => ['required', 'string', 'max:160'],
            'rewards.*.image_url' => ['nullable', 'string', 'max:500'],
            'rewards.*.points_cost' => ['required', 'integer', 'min:1'],
            'rewards.*.discount_type' => ['required', 'string', 'in:percent,fixed'],
            'rewards.*.discount_amount' => ['required', 'integer', 'min:0'],
            'rewards.*.min_cart_minor' => ['nullable', 'integer', 'min:0'],
            'rewards.*.validity_days' => ['nullable', 'integer', 'min:1'],
            'rewards.*.product_ids' => ['nullable', 'array'],
            'rewards.*.category_ids' => ['nullable', 'array'],
            'rewards.*.is_active' => ['nullable', 'boolean'],
        ]);

        $keep = [];
        foreach ($data['rewards'] as $i => $row) {
            $payload = [
                'tenant_id' => $tid,
                'uid' => $row['uid'] ?: LoyaltyService::makeUid(),
                'title' => $row['title'],
                'image_url' => $row['image_url'] ?? null,
                'points_cost' => $row['points_cost'],
                'discount_type' => $row['discount_type'],
                'discount_amount' => $row['discount_amount'],
                'min_cart_minor' => $row['min_cart_minor'] ?? null,
                'validity_days' => $row['validity_days'] ?? null,
                'product_ids' => $row['product_ids'] ?? [],
                'category_ids' => $row['category_ids'] ?? [],
                'is_active' => $row['is_active'] ?? true,
                'sort_order' => $i,
            ];
            if (! empty($row['id'])) {
                $model = LoyaltyReward::query()->where('tenant_id', $tid)->where('id', $row['id'])->first();
                if ($model) {
                    $model->update($payload);
                    $keep[] = $model->id;
                    continue;
                }
            }
            $created = LoyaltyReward::query()->create($payload);
            $keep[] = $created->id;
        }
        LoyaltyReward::query()->where('tenant_id', $tid)->whereNotIn('id', $keep)->delete();

        return response()->json([
            'data' => LoyaltyReward::query()->where('tenant_id', $tid)->orderBy('sort_order')->get(),
        ]);
    }

    public function redeemLoyalty(Request $request, LoyaltyService $loyalty): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['reward_id' => ['required', 'integer']]);
        $user = $request->user();
        $result = $loyalty->redeem((int) $user->tenant_id, $user, (int) $data['reward_id']);

        return response()->json(['data' => $result]);
    }

    public function loyaltyBalance(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'points' => (int) ($user->loyalty_points ?? 0),
            'settings' => ShopSettings::getLoyalty((int) $user->tenant_id),
        ]]);
    }
}
