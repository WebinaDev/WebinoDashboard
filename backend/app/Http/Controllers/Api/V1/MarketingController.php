<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketingCampaign;
use Illuminate\Http\Request;

class MarketingController extends Controller
{
    public function campaigns(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = MarketingCampaign::query()
            ->where('tenant_id', $tid)
            ->orderByDesc('id')
            ->get();

        return response()->json(['data' => $rows]);
    }
}
