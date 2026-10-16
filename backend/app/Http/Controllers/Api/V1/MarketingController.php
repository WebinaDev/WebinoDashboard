<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketingCampaign;
use App\Models\SmsAdCampaign;
use Illuminate\Http\Request;

class MarketingController extends Controller
{
    public function campaigns(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = MarketingCampaign::query()
            ->where('tenant_id', $tid)
            ->orderByDesc('id')
            ->get()
            ->map(fn (MarketingCampaign $row) => [
                'id' => 'mc-'.$row->id,
                'source' => 'marketing',
                'name' => $row->name,
                'status' => $row->status,
                'starts_at' => $row->starts_at?->toIso8601String(),
                'ends_at' => $row->ends_at?->toIso8601String(),
                'channel' => 'generic',
            ]);

        $ads = SmsAdCampaign::query()
            ->where('tenant_id', $tid)
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (SmsAdCampaign $row) => [
                'id' => $row->public_id,
                'source' => 'sms_ad',
                'name' => $row->name,
                'status' => $row->status,
                'starts_at' => $row->scheduled_at?->toIso8601String(),
                'ends_at' => null,
                'channel' => $row->channel,
                'href' => '/dashboard/marketing/sms/ads/'.$row->public_id,
            ]);

        return response()->json([
            'data' => $ads->concat($rows)->values(),
        ]);
    }
}
