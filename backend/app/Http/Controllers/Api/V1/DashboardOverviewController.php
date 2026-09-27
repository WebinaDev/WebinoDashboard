<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Dashboard\DashboardOverviewBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardOverviewController extends Controller
{
    public function __construct(private readonly DashboardOverviewBuilder $builder) {}

    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $locale = (string) ($request->query('locale') ?: $request->header('Accept-Language') ?: 'fa');
        $locale = str_starts_with(strtolower($locale), 'en') ? 'en' : 'fa';

        $data = $this->builder->build($user, $locale);

        return response()->json(['data' => $data])
            ->header('Cache-Control', 'private, max-age=90');
    }

    public function smsPanel(Request $request): JsonResponse
    {
        $force = filter_var($request->query('refresh', false), FILTER_VALIDATE_BOOLEAN);
        $data = $this->builder->smsPanel($request->user(), $force);

        return response()->json(['data' => $data])
            ->header('Cache-Control', 'private, max-age=60');
    }
}
