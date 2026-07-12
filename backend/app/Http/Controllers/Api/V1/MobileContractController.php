<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/** FEATURES Phase 3 — native apps API surface (frozen contracts placeholder). */
class MobileContractController extends Controller
{
    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'openapi_version' => '3.1.0',
            'phase' => 'phase_3',
            'notes' => 'Replace with generated schema once MVP endpoints are stable.',
            'base_path' => '/api/v1',
        ]);
    }
}
