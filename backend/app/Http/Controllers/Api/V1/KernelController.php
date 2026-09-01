<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Kernel\ModuleRegistry;
use App\Kernel\SiteTypeProfiles;
use App\Kernel\TenantActivationService;
use Illuminate\Http\Request;

class KernelController extends Controller
{
    public function registry(ModuleRegistry $registry): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $registry->registryPayload()])
            ->header('Cache-Control', 'public, max-age=300');
    }

    public function siteTypes(): \Illuminate\Http\JsonResponse
    {
        $types = collect(SiteTypeProfiles::all())->map(fn ($profile, $slug) => [
            'slug' => $slug,
            'name_fa' => $profile['name_fa'],
            'name_en' => $profile['name_en'],
            'default_theme_slug' => $profile['theme'],
        ])->values();

        return response()->json(['data' => $types]);
    }

    public function tenantActivations(Request $request, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $activations->activationsForTenant($tenantId),
        ])->header('Cache-Control', 'private, max-age=30');
    }

    public function publicActivations(Request $request, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        return app(PublicKernelController::class)->activations($request, $activations);
    }
}
