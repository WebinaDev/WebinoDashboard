<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Dashboard\CoreUpdateService;
use App\Services\Dashboard\DashboardReleaseClient;
use Illuminate\Http\Request;

class CoreUpdateController extends Controller
{
    public function status(CoreUpdateService $updates): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $updates->cachedStatus()]);
    }

    public function check(Request $request, CoreUpdateService $updates, DashboardReleaseClient $client): \Illuminate\Http\JsonResponse
    {
        $refresh = $request->boolean('refresh') || $request->boolean('force');

        return response()->json(['data' => $updates->check($refresh, $client)]);
    }

    public function download(Request $request, CoreUpdateService $updates, DashboardReleaseClient $client): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'version' => ['nullable', 'string', 'max:64'],
        ]);

        try {
            $result = $updates->downloadPackage($data['version'] ?? null, $client);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json(['data' => $result]);
    }

    public function apply(Request $request, CoreUpdateService $updates, DashboardReleaseClient $client): \Illuminate\Http\JsonResponse
    {
        if (! config('dashboard.self_update')) {
            return response()->json([
                'message' => __('api.dashboard_self_update_disabled'),
                'errors' => ['code' => 'SELF_UPDATE_DISABLED'],
            ], 422);
        }

        $data = $request->validate([
            'version' => ['nullable', 'string', 'max:64'],
        ]);

        try {
            $result = $updates->apply($data['version'] ?? null, $client);
        } catch (\DomainException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => ['code' => 'SELF_UPDATE_DISABLED'],
            ], 422);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }

        return response()->json(['data' => $result]);
    }

    public function backups(CoreUpdateService $updates): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $updates->listBackups()]);
    }
}
