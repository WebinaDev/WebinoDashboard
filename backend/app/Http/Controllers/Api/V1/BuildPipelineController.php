<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Dashboard\BuildPipelineService;
class BuildPipelineController extends Controller
{
    public function status(BuildPipelineService $pipeline): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $pipeline->status()]);
    }

    public function start(BuildPipelineService $pipeline): \Illuminate\Http\JsonResponse
    {
        if (! config('dashboard.build_pipeline')) {
            return response()->json([
                'message' => __('api.dashboard_build_pipeline_disabled'),
                'errors' => ['code' => 'BUILD_PIPELINE_DISABLED'],
            ], 422);
        }

        try {
            $data = $pipeline->start();
        } catch (\DomainException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => ['code' => 'BUILD_PIPELINE_DISABLED'],
            ], 422);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => $data]);
    }

    public function cancel(BuildPipelineService $pipeline): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $pipeline->cancel()]);
    }
}
