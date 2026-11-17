<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Cafe\CafeManagerService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Manager KPI board. Read-only by design: a manager dashboard must never mutate orders.
 */
class CafeManagerController extends Controller
{
    private const RANGES = ['today', 'week', 'month', 'last7', 'last30'];

    public function __construct(private readonly CafeManagerService $manager) {}

    public function overview(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'range' => ['nullable', 'string', Rule::in(self::RANGES)],
        ]);

        $range = (string) ($data['range'] ?? 'today');

        return response()->json(['data' => $this->manager->overview((int) $request->user()->tenant_id, $range)])
            // Short private cache: several tabs open on one screen should not each hit the DB.
            ->header('Cache-Control', 'private, max-age=45');
    }
}
