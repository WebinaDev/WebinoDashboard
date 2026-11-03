<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMission;
use App\Services\Shop\LoyaltyService;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LoyaltyMissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $this->ensureDefaults($tid);
        $rows = LoyaltyMission::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $rows,
            'types' => LoyaltyMission::TYPES,
            'loyalty' => ShopSettings::getLoyalty($tid),
        ]);
    }

    public function save(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'missions' => ['required', 'array'],
            'missions.*.id' => ['nullable', 'integer'],
            'missions.*.type' => ['required', 'string', Rule::in(LoyaltyMission::TYPES)],
            'missions.*.title' => ['required', 'string', 'max:160'],
            'missions.*.description' => ['nullable', 'string', 'max:500'],
            'missions.*.points' => ['required', 'integer', 'min:0', 'max:1000000'],
            'missions.*.config' => ['nullable', 'array'],
            'missions.*.config.target_count' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'missions.*.config.target_amount_minor' => ['nullable', 'integer', 'min:1'],
            'missions.*.config.cooldown_hours' => ['nullable', 'integer', 'min:0', 'max:8760'],
            'missions.*.config.url' => ['nullable', 'string', 'max:1024'],
            'missions.*.config.code' => ['nullable', 'string', 'max:64'],
            'missions.*.is_active' => ['nullable', 'boolean'],
        ]);

        $keep = [];
        foreach ($data['missions'] as $i => $row) {
            $payload = [
                'tenant_id' => $tid,
                'type' => $row['type'],
                'title' => $row['title'],
                'description' => $row['description'] ?? null,
                'points' => (int) $row['points'],
                'config' => $row['config'] ?? [],
                'is_active' => $row['is_active'] ?? true,
                'sort_order' => $i,
            ];
            if (! empty($row['id'])) {
                $model = LoyaltyMission::query()->where('tenant_id', $tid)->where('id', $row['id'])->first();
                if ($model) {
                    $model->update($payload);
                    $keep[] = $model->id;
                    continue;
                }
            }
            $created = LoyaltyMission::query()->create($payload);
            $keep[] = $created->id;
        }
        LoyaltyMission::query()->where('tenant_id', $tid)->whereNotIn('id', $keep)->delete();

        // Keep legacy daily_points in sync with the first active daily_checkin mission.
        $daily = LoyaltyMission::query()
            ->where('tenant_id', $tid)
            ->where('type', 'daily_checkin')
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->first();
        $loyalty = ShopSettings::getLoyalty($tid);
        $loyalty['daily_points'] = $daily ? (int) $daily->points : 0;
        ShopSettings::saveLoyalty($tid, $loyalty);

        return response()->json([
            'data' => LoyaltyMission::query()->where('tenant_id', $tid)->orderBy('sort_order')->get(),
        ]);
    }

    public function claim(Request $request, int $mission, LoyaltyService $loyalty): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:64'],
        ]);
        try {
            $result = $loyalty->claimMission((int) $user->tenant_id, $user, $mission, $data['code'] ?? null);
        } catch (ValidationException $e) {
            throw $e;
        }

        return response()->json(['data' => $result]);
    }

    /** Seed a daily check-in mission from shop.loyalty.daily_points when the tenant has none. */
    private function ensureDefaults(int $tid): void
    {
        if (LoyaltyMission::query()->where('tenant_id', $tid)->exists()) {
            return;
        }
        $loyalty = ShopSettings::getLoyalty($tid);
        $daily = max(0, (int) ($loyalty['daily_points'] ?? 0));
        LoyaltyMission::query()->create([
            'tenant_id' => $tid,
            'type' => 'daily_checkin',
            'title' => 'Daily check-in',
            'description' => null,
            'points' => $daily > 0 ? $daily : 10,
            'config' => ['cooldown_hours' => 24],
            'is_active' => $daily > 0,
            'sort_order' => 0,
        ]);
        if ((int) ($loyalty['welcome_points'] ?? 0) > 0) {
            LoyaltyMission::query()->create([
                'tenant_id' => $tid,
                'type' => 'welcome',
                'title' => 'Welcome bonus',
                'description' => null,
                'points' => (int) $loyalty['welcome_points'],
                'config' => [],
                'is_active' => true,
                'sort_order' => 1,
            ]);
        }
        if ((int) ($loyalty['referral_points'] ?? 0) > 0) {
            LoyaltyMission::query()->create([
                'tenant_id' => $tid,
                'type' => 'referral',
                'title' => 'Referral reward',
                'description' => null,
                'points' => (int) $loyalty['referral_points'],
                'config' => [],
                'is_active' => true,
                'sort_order' => 2,
            ]);
        }
    }
}
