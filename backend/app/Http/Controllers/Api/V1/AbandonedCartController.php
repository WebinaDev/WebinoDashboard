<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Marketing\AbandonedCartService;
use Illuminate\Http\Request;

class AbandonedCartController extends Controller
{
    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => AbandonedCartService::get((int) $request->user()->tenant_id)]);
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'channels' => ['sometimes', 'array'],
            'channels.bot' => ['sometimes', 'boolean'],
            'channels.sms' => ['sometimes', 'boolean'],
            'min_subtotal' => ['sometimes', 'integer', 'min:0'],
            'stages' => ['sometimes', 'array', 'max:3'],
            'stages.*.delay_hours' => ['required_with:stages', 'integer', 'min:1', 'max:720'],
            'stages.*.message' => ['nullable', 'string', 'max:1000'],
            'stages.*.coupon_type' => ['nullable', 'in:none,percent,fixed'],
            'stages.*.coupon_amount' => ['nullable', 'integer', 'min:0'],
            'stages.*.coupon_expires_days' => ['nullable', 'integer', 'min:1', 'max:90'],
        ]);
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => AbandonedCartService::save($tid, array_replace(AbandonedCartService::get($tid), $data))]);
    }

    public function index(Request $request, AbandonedCartService $svc): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $svc->report((int) $request->user()->tenant_id)]);
    }

    public function runNow(Request $request, AbandonedCartService $svc): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => ['sent' => $svc->run((int) $request->user()->tenant_id)]]);
    }
}
